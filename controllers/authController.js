const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  createVerificationEmailHTML,
  createResendOTPEmailHTML,
} = require("../templete/emailTemplete");
const {
  generateReferralCode,
  verifyReferralCode,
  processReferralReward,
} = require("../utils/referralUtils");

// Constants
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
const REFERRAL_REWARD_COINS = parseInt(process.env.REFERRAL_REWARD_COINS) || 10;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

// Email Transporter Setup with better configuration
const createEmailTransporter = () => {
  console.log("🔧 Setting up email transporter...");

  // Validate email configuration
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error(
      "❌ Email configuration missing! Check EMAIL_USER and EMAIL_PASS in .env"
    );
    throw new Error("Email configuration is required for OTP sending");
  }

  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Enhanced configuration for better reliability
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 20000, // Send maximum 3 emails per 20 seconds
    rateLimit: 3,
    // Add timeout settings
    connectionTimeout: 60000, // 60 seconds
    greetingTimeout: 30000, // 30 seconds
    socketTimeout: 60000, // 60 seconds
    // Debug settings
    debug: process.env.NODE_ENV === "development",
    logger: process.env.NODE_ENV === "development",
  });

  // Enhanced verification with retry
  const verifyTransporter = async (retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(
          `📧 Verifying email transporter (attempt ${attempt}/${retries})`
        );
        await transporter.verify();
        console.log("✅ Email transporter verified successfully");
        return true;
      } catch (error) {
        console.error(
          `❌ Email transporter verification failed (attempt ${attempt}):`,
          {
            error: error.message,
            code: error.code,
            command: error.command,
          }
        );

        if (attempt === retries) {
          console.error(
            "❌ Email transporter verification failed after all attempts"
          );
          // Don't throw error, just log it - we'll handle it in sendEmail
          return false;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  };

  // Verify on startup (async)
  verifyTransporter().catch((error) => {
    console.error(
      "❌ Initial email transporter verification failed:",
      error.message
    );
  });

  return transporter;
};

const transporter = createEmailTransporter();

// Generate secure OTP
const generateOTP = () => {
  // Generate cryptographically secure 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  // Validate OTP format
  if (!/^\d{6}$/.test(otp)) {
    console.error("❌ Invalid OTP generated:", otp);
    throw new Error("Failed to generate valid OTP");
  }

  console.log("✅ Generated valid OTP:", otp.substring(0, 2) + "****");
  return otp;
};

// Check if user is admin
const checkIsAdmin = (email) => {
  if (!email || typeof email !== "string") {
    return false;
  }

  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((email) =>
        email.trim().toLowerCase()
      )
    : [];

  return adminEmails.includes(email.toLowerCase());
};

// Validate password strength
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasNonalphas = /\W/.test(password);

  const errors = [];

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!hasLowerCase) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!hasNumbers) {
    errors.push("Password must contain at least one number");
  }
  if (!hasNonalphas) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// 🔥 FIXED: Better email sending with retry logic
const sendEmailWithRetry = async (mailOptions, maxRetries = 3) => {
  console.log(`📤 Attempting to send email to: ${mailOptions.to}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📧 Email sending attempt ${attempt}/${maxRetries}`);

      // Validate mail options
      if (!mailOptions.to || !mailOptions.subject || !mailOptions.html) {
        throw new Error("Invalid email options: missing required fields");
      }

      // Test transporter before sending
      console.log("🔍 Testing transporter connection...");
      await transporter.verify();
      console.log("✅ Transporter connection verified");

      // Send email with timeout
      const sendPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Email sending timeout after 45 seconds")),
          45000
        )
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);

      console.log(`✅ Email sent successfully on attempt ${attempt}:`, {
        messageId: result.messageId,
        response: result.response,
        envelope: result.envelope,
      });

      return result;
    } catch (error) {
      console.error(`❌ Email sending failed on attempt ${attempt}:`, {
        error: error.message,
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response,
      });

      // Specific error handling
      if (error.code === "EAUTH") {
        console.error(
          "❌ Email authentication failed - check EMAIL_USER and EMAIL_PASS"
        );
        throw new Error(
          "Email authentication failed. Please check your email credentials."
        );
      }

      if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        console.error(
          "❌ Email server connection failed - check internet connection"
        );
      }

      if (error.responseCode === 550) {
        console.error(
          "❌ Email rejected by server - possible spam or invalid recipient"
        );
      }

      if (attempt === maxRetries) {
        console.error(`❌ Email sending failed after ${maxRetries} attempts`);
        throw new Error(
          `Failed to send email after ${maxRetries} attempts: ${error.message}`
        );
      }

      // Progressive backoff delay
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// 🔧 FIXED: controllers/authController.js - Registration OTP Issue
exports.register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    console.log("📧 Registration request received:", {
      name: name?.substring(0, 20),
      email: email?.substring(0, 30),
      hasReferral: !!referralCode,
      timestamp: new Date().toISOString(),
    });

    // Enhanced input validation
    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 2 characters long",
        code: "INVALID_NAME",
      });
    }

    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
        code: "INVALID_EMAIL",
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet requirements",
        errors: passwordValidation.errors,
        code: "WEAK_PASSWORD",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      console.log("⚠️ Registration attempt with existing email:", cleanEmail);
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
        code: "EMAIL_EXISTS",
      });
    }

    // Validate referral code if provided
    let referrer = null;
    if (referralCode && referralCode.trim()) {
      console.log("🔍 Validating referral code:", referralCode.trim());
      const referralCheck = await verifyReferralCode(referralCode.trim());
      if (!referralCheck.valid) {
        return res.status(400).json({
          success: false,
          message: referralCheck.message,
          code: "INVALID_REFERRAL",
        });
      }
      referrer = referralCheck.referrer;
      console.log("✅ Valid referral code from:", referrer.name);
    }

    // Hash password
    console.log("🔒 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate unique referral code with retry logic
    console.log("🎯 Generating unique referral code...");
    let newReferralCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      newReferralCode = generateReferralCode(name, email);
      const existingCode = await User.findOne({
        referralCode: newReferralCode.toUpperCase(),
      });
      if (!existingCode) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      console.error(
        "❌ Failed to generate unique referral code after",
        maxAttempts,
        "attempts"
      );
      return res.status(500).json({
        success: false,
        message: "Unable to generate unique referral code. Please try again.",
        code: "REFERRAL_CODE_GENERATION_FAILED",
      });
    }

    console.log("✅ Generated unique referral code:", newReferralCode);

    // 🔥 FIXED: Generate OTP with enhanced validation
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    console.log("🔑 Generated OTP for registration:", {
      email: cleanEmail,
      otp: otp.substring(0, 2) + "****", // Partial log for security
      expiresAt: otpExpiry.toISOString(),
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });

    // Create user FIRST before attempting email
    console.log("👤 Creating user account...");
    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      referralCode: newReferralCode.toUpperCase(),
      referredBy: referrer ? referrer._id : null,
      otp,
      otpExpiry,
      isActive: true,
      isVerified: false, // Will be set to true after OTP verification
      otpAttempts: 0, // Reset OTP attempts
    });

    await user.save();
    console.log("✅ User created successfully with ID:", user._id);

    // 🔥 ENHANCED: Email sending with comprehensive error handling
    try {
      console.log("📧 Preparing to send OTP email...");

      // Validate email template data
      if (!createVerificationEmailHTML) {
        throw new Error("Email template function not available");
      }

      // Create email content
      const emailHTML = createVerificationEmailHTML(name.trim(), otp);
      const emailText = `Hi ${name.trim()},\n\nYour verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nBest regards,\nParty-Support Team`;

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || "Party-Support",
          address: process.env.EMAIL_USER,
        },
        to: cleanEmail,
        subject: "🔐 Verify Your Email - Party-Support",
        html: emailHTML,
        text: emailText, // Fallback text version
        // Additional headers for better delivery
        headers: {
          "X-Mailer": "Party-Support Registration System",
          "X-Priority": "1",
        },
      };

      console.log("📤 Sending OTP email with options:", {
        to: mailOptions.to,
        subject: mailOptions.subject,
        from: mailOptions.from,
        hasHTML: !!mailOptions.html,
        hasText: !!mailOptions.text,
      });

      // Send email with retry
      const emailResult = await sendEmailWithRetry(mailOptions, 3);

      console.log("✅ OTP email sent successfully:", {
        messageId: emailResult.messageId,
        response: emailResult.response?.substring(0, 100),
      });

      // Success response with email confirmation
      res.status(201).json({
        success: true,
        message:
          "Registration successful! Please check your email for OTP verification.",
        data: {
          userId: user._id,
          email: user.email,
          referralCode: user.referralCode,
          otpExpiresAt: otpExpiry.toISOString(),
          otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
          emailSent: true,
          emailMessageId: emailResult.messageId,
        },
      });
    } catch (emailError) {
      console.error("❌ Email sending failed during registration:", {
        error: emailError.message,
        code: emailError.code,
        userId: user._id,
        email: cleanEmail,
      });

      // Update user with email failure info
      user.otpAttempts = 1; // Mark that email sending was attempted
      await user.save();

      // Don't fail the entire registration - user can request resend
      res.status(201).json({
        success: true,
        message:
          "Registration successful! However, there was an issue sending the verification email. Please use the resend OTP option.",
        data: {
          userId: user._id,
          email: user.email,
          referralCode: user.referralCode,
          otpExpiresAt: otpExpiry.toISOString(),
          emailSent: false,
          emailError: "Email service temporarily unavailable",
          canResendOTP: true,
          resendAvailableIn: 0, // Can resend immediately on failure
        },
      });
    }
  } catch (error) {
    console.error("❌ Registration error:", {
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(409).json({
        success: false,
        message: `This ${field} is already registered`,
        code: "DUPLICATE_FIELD",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
        code: "VALIDATION_ERROR",
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      code: "INTERNAL_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 🔥 FIXED: Verify OTP with better error handling
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log("📧 OTP verification request:", {
      email: email?.substring(0, 10) + "...",
      otp: otp?.substring(0, 2) + "****",
    });

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // 🔥 FIXED: More specific user lookup
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("+otp +otpExpiry");

    if (!user) {
      console.log("❌ User not found for OTP verification:", email);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      console.log("⚠️ User already verified:", user.email);
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }

    // 🔥 FIXED: Better OTP validation
    if (!user.otp) {
      console.log("❌ No OTP found for user:", user.email);
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new verification code.",
      });
    }

    const providedOTP = otp.toString().trim();
    const storedOTP = user.otp.toString().trim();

    console.log("🔍 OTP comparison:", {
      provided: providedOTP.substring(0, 2) + "****",
      stored: storedOTP.substring(0, 2) + "****",
      match: providedOTP === storedOTP,
    });

    if (storedOTP !== providedOTP) {
      console.log("❌ Invalid OTP provided for user:", user.email);
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code",
      });
    }

    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      console.log("❌ Expired OTP for user:", user.email);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new verification code.",
      });
    }

    // Start transaction for atomic operations
    const session = await User.db.startSession();

    try {
      await session.withTransaction(async () => {
        // Verify user and clear OTP
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpiry = undefined;
        user.lastLogin = new Date();
        await user.save({ session });

        console.log("✅ User verified successfully:", user.email);

        // Process referral reward if user was referred
        if (user.referredBy) {
          console.log("🎁 Processing referral reward for:", user.referredBy);
          await processReferralReward(user.referredBy, user._id, session);
        }
      });

      res.json({
        success: true,
        message:
          "Email verified successfully! You can now login to your account.",
        data: {
          verified: true,
          canLogin: true,
        },
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("❌ OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: "Verification failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 🔥 FIXED: Resend OTP with better validation
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    console.log("🔄 Resend OTP request:", {
      email: email?.substring(0, 30),
      timestamp: new Date().toISOString(),
    });

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
        code: "EMAIL_REQUIRED",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      console.log("❌ Resend OTP: User not found for email:", cleanEmail);
      return res.status(404).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.isVerified) {
      console.log("⚠️ Resend OTP: User already verified:", cleanEmail);
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
        code: "ALREADY_VERIFIED",
      });
    }

    // Check rate limiting for OTP resend
    const now = new Date();
    const timeSinceLastOTP = user.updatedAt ? now - user.updatedAt : Infinity;
    const minWaitTime = 60 * 1000; // 1 minute between resends

    if (timeSinceLastOTP < minWaitTime) {
      const waitSeconds = Math.ceil((minWaitTime - timeSinceLastOTP) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting another OTP`,
        code: "RATE_LIMITED",
        waitSeconds,
      });
    }

    // Check max OTP attempts
    if (user.otpAttempts >= 10) {
      console.log("❌ Max OTP attempts reached for user:", cleanEmail);
      return res.status(429).json({
        success: false,
        message: "Maximum OTP attempts reached. Please contact support.",
        code: "MAX_ATTEMPTS_REACHED",
      });
    }

    // 🔥 FIXED: Generate new OTP with proper validation
    const newOtp = generateOTP();
    const newOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    console.log("🔑 Generated new OTP for resend:", {
      email: cleanEmail,
      otp: newOtp.substring(0, 2) + "****",
      expiresAt: newOtpExpiry.toISOString(),
      attempt: user.otpAttempts + 1,
    });

    // Update user with new OTP
    user.otp = newOtp;
    user.otpExpiry = newOtpExpiry;
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    await user.save();

    // Send new OTP email
    try {
      const emailHTML = createResendOTPEmailHTML(user.name, newOtp);
      const emailText = `Hi ${user.name},\n\nYour new verification code is: ${newOtp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nBest regards,\nParty-Support Team`;

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || "Party-Support",
          address: process.env.EMAIL_USER,
        },
        to: cleanEmail,
        subject: "🔄 New Verification Code - Party-Support",
        html: emailHTML,
        text: emailText,
        headers: {
          "X-Mailer": "Party-Support OTP Resend System",
          "X-Priority": "1",
        },
      };

      const emailResult = await sendEmailWithRetry(mailOptions, 3);

      console.log("✅ New OTP email sent successfully:", {
        messageId: emailResult.messageId,
        attempt: user.otpAttempts,
      });

      res.json({
        success: true,
        message:
          "New verification code sent successfully! Please check your email.",
        data: {
          otpExpiresAt: newOtpExpiry.toISOString(),
          otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
          emailSent: true,
          emailMessageId: emailResult.messageId,
          attemptsRemaining: Math.max(0, 10 - user.otpAttempts),
        },
      });
    } catch (emailError) {
      console.error("❌ Failed to send resend OTP email:", {
        error: emailError.message,
        code: emailError.code,
        email: cleanEmail,
        attempt: user.otpAttempts,
      });

      res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again later.",
        code: "EMAIL_SEND_FAILED",
        error:
          process.env.NODE_ENV === "development"
            ? emailError.message
            : "Email service temporarily unavailable",
      });
    }
  } catch (error) {
    console.error("❌ Resend OTP error:", {
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      message: "Failed to resend verification code. Please try again.",
      code: "INTERNAL_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user and include password field
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before logging in. Check your inbox for the verification code.",
        requiresVerification: true,
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Check admin status
    const isAdmin = checkIsAdmin(user.email);

    // Create JWT payload
    const payload = {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        referralCode: user.referralCode,
        is_admin: isAdmin,
      },
    };

    // Sign JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Return success response
    res.json({
      success: true,
      message: "Login successful! Welcome back.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        coins: user.coins || 0,
        referralCount: user.referralCount || 0,
        is_admin: isAdmin,
        lastLogin: user.lastLogin,
        memberSince: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Logout User
exports.logout = async (req, res) => {
  try {
    // In JWT-based authentication, logout is typically handled client-side
    // by removing the token. Here we just confirm the logout.

    res.json({
      success: true,
      message: "Logged out successfully. Your session has been terminated.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

// Dashboard
exports.dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -otp -otpExpiry")
      .populate("referralHistory.referredUser", "name email createdAt");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Re-validate admin status
    const isAdmin = checkIsAdmin(user.email);

    // Calculate additional stats
    const totalCoinsFromReferrals = user.referralHistory.reduce(
      (sum, ref) => sum + (ref.coinsEarned || 0),
      0
    );

    const recentReferrals = user.referralHistory.filter((ref) => {
      const referralDate = new Date(ref.referredAt);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return referralDate >= thirtyDaysAgo;
    }).length;

    res.json({
      success: true,
      message: `Welcome back, ${user.name}! 🎉`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        referralLink: `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/register?ref=${user.referralCode}`,
        coins: user.coins || 0,
        referralCount: user.referralCount || 0,
        referralHistory: user.referralHistory || [],
        is_admin: isAdmin,
        adminConfirmed: req.user.adminConfirmed || false,
        lastLogin: user.lastLogin,
        memberSince: user.createdAt,
        isActive: user.isActive,
        stats: {
          totalCoinsFromReferrals,
          recentReferrals,
          averageCoinsPerReferral:
            user.referralCount > 0
              ? (totalCoinsFromReferrals / user.referralCount).toFixed(2)
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get User Counts (Admin only)
exports.getUserCounts = async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required to view user statistics",
      });
    }

    // Calculate date ranges
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for better performance
    const [
      totalUsers,
      verifiedUsers,
      activeUsers,
      todayRegistrations,
      weekRegistrations,
      monthRegistrations,
      totalReferrals,
      totalCoinsDistributed,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: thisWeek } }),
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      User.aggregate([
        { $match: { isVerified: true } },
        { $group: { _id: null, total: { $sum: "$referralCount" } } },
      ]),
      User.aggregate([
        { $match: { isVerified: true } },
        { $group: { _id: null, total: { $sum: "$coins" } } },
      ]),
    ]);

    const totalReferralCount = totalReferrals[0]?.total || 0;
    const totalCoins = totalCoinsDistributed[0]?.total || 0;

    res.json({
      success: true,
      message: "User statistics retrieved successfully",
      data: {
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          active: activeUsers,
          verificationRate:
            totalUsers > 0
              ? ((verifiedUsers / totalUsers) * 100).toFixed(2)
              : 0,
        },
        registrations: {
          today: todayRegistrations,
          thisWeek: weekRegistrations,
          thisMonth: monthRegistrations,
        },
        referrals: {
          totalReferrals: totalReferralCount,
          totalCoinsDistributed: totalCoins,
          averageReferralsPerUser:
            verifiedUsers > 0
              ? (totalReferralCount / verifiedUsers).toFixed(2)
              : 0,
          usersWithReferrals: await User.countDocuments({
            isVerified: true,
            referralCount: { $gt: 0 },
          }),
        },
        requestedBy: {
          name: req.user.name,
          email: req.user.email,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Get user counts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Export utility function
exports.checkIsAdmin = checkIsAdmin;
