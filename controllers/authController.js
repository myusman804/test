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
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 20000, // Send maximum 3 emails per 20 seconds
    rateLimit: 3,
  });

  // Verify transporter on startup
  transporter.verify((error, success) => {
    if (error) {
      console.error("❌ Email transporter configuration error:", error.message);
    } else {
      console.log("✅ Email server is ready to send messages");
    }
  });

  return transporter;
};

const transporter = createEmailTransporter();

// Generate secure OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
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
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Email sending attempt ${attempt}/${maxRetries}`);

      // Add timeout to email sending
      const sendPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("Email sending timeout")), 30000) // 30 second timeout
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);

      console.log(
        `✅ Email sent successfully on attempt ${attempt}:`,
        result.messageId
      );
      return result;
    } catch (error) {
      console.error(`❌ Email sending failed on attempt ${attempt}:`, {
        error: error.message,
        code: error.code,
        command: error.command,
      });

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to send email after ${maxRetries} attempts: ${error.message}`
        );
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
};

// 🔧 FIXED: controllers/authController.js - Registration OTP Issue
exports.register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    console.log("📧 Registration request received:", {
      name,
      email: email?.substring(0, 10) + "...",
      hasReferral: !!referralCode,
    });

    // Additional server-side validation
    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 2 characters long",
      });
    }

    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet requirements",
        errors: passwordValidation.errors,
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Validate referral code if provided
    let referrer = null;
    if (referralCode && referralCode.trim()) {
      const referralCheck = await verifyReferralCode(referralCode.trim());
      if (!referralCheck.valid) {
        return res.status(400).json({
          success: false,
          message: referralCheck.message,
        });
      }
      referrer = referralCheck.referrer;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate unique referral code with retry logic
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
      return res.status(500).json({
        success: false,
        message: "Unable to generate unique referral code. Please try again.",
      });
    }

    // 🔥 FIXED: Generate OTP with better validation
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    console.log("🔑 Generated OTP for registration:", {
      email: email.toLowerCase(),
      otp: otp.substring(0, 2) + "****", // Log partially for debugging
      expiresAt: otpExpiry,
    });

    // Create user FIRST before sending email
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      referralCode: newReferralCode.toUpperCase(),
      referredBy: referrer ? referrer._id : null,
      otp,
      otpExpiry,
      isActive: true,
      isVerified: false, // Will be set to true after OTP verification
    });

    await user.save();
    console.log("✅ User created successfully with ID:", user._id);

    // 🔥 FIXED: Test email transporter before sending
    try {
      // Verify transporter configuration
      const testResult = await transporter.verify();
      console.log("📧 Email transporter verified:", testResult);
    } catch (verifyError) {
      console.error("❌ Email transporter verification failed:", verifyError);
      // Continue anyway, but log the issue
    }

    // Send verification email with better error handling
    const mailOptions = {
      from: {
        name: process.env.EMAIL_FROM_NAME || "Party-Support",
        address: process.env.EMAIL_USER,
      },
      to: email.toLowerCase(),
      subject: "🔐 Verify Your Email - Party-Support",
      html: createVerificationEmailHTML(name.trim(), otp),
      // Add text fallback
      text: `Hi ${name.trim()},\n\nYour verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nBest regards,\nParty-Support Team`,
    };

    console.log("📤 Attempting to send OTP email...");

    try {
      const emailResult = await sendEmailWithRetry(mailOptions);
      console.log("✅ OTP email sent successfully:", emailResult?.messageId);

      res.status(201).json({
        success: true,
        message:
          "Registration successful! Please check your email for OTP verification.",
        data: {
          userId: user._id,
          email: user.email,
          referralCode: user.referralCode,
          otpExpiresAt: otpExpiry,
          emailSent: true,
        },
      });
    } catch (emailError) {
      console.error("❌ Email sending failed during registration:", emailError);

      // Don't fail the registration, but inform about email issue
      res.status(201).json({
        success: true,
        message:
          "Registration successful! However, there was an issue sending the verification email. Please use the resend OTP option.",
        data: {
          userId: user._id,
          email: user.email,
          referralCode: user.referralCode,
          emailSent: false,
          emailError:
            process.env.NODE_ENV === "development"
              ? emailError.message
              : "Email service temporarily unavailable",
        },
      });
    }
  } catch (error) {
    console.error("❌ Registration error:", error);

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `This ${field} is already registered`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
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

    console.log("🔄 Resend OTP request for:", email?.substring(0, 10) + "...");

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }

    // 🔥 FIXED: Generate new OTP with proper validation
    const newOtp = generateOTP();
    const newOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    console.log("🔑 Generated new OTP for resend:", {
      email: user.email,
      otp: newOtp.substring(0, 2) + "****",
      expiresAt: newOtpExpiry,
    });

    user.otp = newOtp;
    user.otpExpiry = newOtpExpiry;
    await user.save();

    // Send new OTP email with retry
    const mailOptions = {
      from: {
        name: process.env.EMAIL_FROM_NAME || "Party-Support",
        address: process.env.EMAIL_USER,
      },
      to: user.email,
      subject: "🔄 New Verification Code - Party-Support",
      html: createResendOTPEmailHTML(user.name, newOtp),
      text: `Hi ${user.name},\n\nYour new verification code is: ${newOtp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nBest regards,\nParty-Support Team`,
    };

    try {
      await sendEmailWithRetry(mailOptions);
      console.log("✅ New OTP email sent successfully");

      res.json({
        success: true,
        message:
          "New verification code sent successfully! Please check your email.",
        data: {
          otpExpiresAt: newOtpExpiry,
          emailSent: true,
        },
      });
    } catch (emailError) {
      console.error("❌ Failed to send resend OTP email:", emailError);

      res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again later.",
        error:
          process.env.NODE_ENV === "development"
            ? emailError.message
            : "Email service temporarily unavailable",
      });
    }
  } catch (error) {
    console.error("❌ Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend verification code. Please try again.",
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
