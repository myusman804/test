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

// Email Transporter Setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate OTP
const generateOTP = () => crypto.randomInt(100000, 999999).toString();

// Register User and Send OTP with Referral Support
exports.register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    // Verify referral code if provided
    let referrerData = null;
    if (referralCode) {
      const referralVerification = await verifyReferralCode(referralCode);
      if (!referralVerification.valid) {
        return res.status(400).json({
          message: referralVerification.message,
        });
      }
      referrerData = referralVerification.referrer;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate unique referral code for new user
    let userReferralCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      userReferralCode = generateReferralCode(name, email);
      const existingUser = await User.findOne({
        referralCode: userReferralCode,
      });
      if (!existingUser) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({
        message: "Error generating unique referral code. Please try again.",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Create new user
    user = new User({
      name,
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
      referralCode: userReferralCode,
      referredBy: referrerData ? referrerData._id : null,
    });

    await user.save();

    // Send verification email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "🔐 Verify Your AdsMoney Account",
      html: createVerificationEmailHTML(name, otp),
      text: `Hi ${name}, Your AdsMoney verification code is: ${otp}. This code will expire in 10 minutes.`,
    });

    res.status(201).json({
      message:
        "User registered successfully! Please check your email for the verification code.",
      email: email,
      referralCode: userReferralCode,
      referredBy: referrerData ? referrerData.name : null,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      message: "Error registering user",
      error: error.message,
    });
  }
};

// Verify OTP with Referral Reward Processing
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified)
      return res.status(400).json({ message: "User already verified" });

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Mark user as verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Process referral reward if user was referred
    let referralReward = null;
    if (user.referredBy) {
      const rewardResult = await processReferralReward(
        user.referredBy,
        user._id
      );
      if (rewardResult.success) {
        referralReward = {
          coinsEarned: rewardResult.coinsEarned,
          referrerRewarded: true,
        };
      }
    }

    res.json({
      message: "Email verified successfully. You can now log in.",
      referralReward,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({
      message: "Error verifying OTP",
      error: error.message,
    });
  }
};

// 👇 Add this new controller
exports.getUserCounts = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const activeUsers = await User.countDocuments({ isActive: true });

    res.json({
      success: true,
      message: "Users count retrieved successfully",
      data: {
        totalUsers,
        verifiedUsers,
        activeUsers,
      },
    });
  } catch (error) {
    console.error("Get users count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve users count",
      error: error.message,
    });
  }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified)
      return res.status(400).json({ message: "User already verified" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "🔄 Your New AdsMoney Verification Code",
      html: createResendOTPEmailHTML(user.name, otp),
      text: `Hi ${user.name}, Your new AdsMoney verification code is: ${otp}. This code will expire in 10 minutes.`,
    });

    res.json({ message: "OTP resent successfully." });
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({
      message: "Error resending OTP",
      error: error.message,
    });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        message: "Email not verified. Please verify OTP.",
      });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        referralCode: user.referralCode,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.json({
          message: "Login successful",
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            referralCode: user.referralCode,
            coins: user.coins || 0,
            referralCount: user.referralCount || 0,
          },
        });
      }
    );
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({
      message: "Error logging in",
      error: error.message,
    });
  }
};

// Logout User
exports.logout = (req, res) => {
  res.json({ message: "Logged out successfully" });
};

// Dashboard (Protected Route)
exports.dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -otp -otpExpiry")
      .populate("referralHistory.referredUser", "name email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: `Welcome to the dashboard, ${user.name}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        coins: user.coins || 0,
        referralCount: user.referralCount || 0,
        referralHistory: user.referralHistory || [],
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
