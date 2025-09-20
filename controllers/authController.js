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

    const isAdmin = checkIsAdmin(email);

    console.log(`[v0] Login attempt for ${email}, admin status: ${isAdmin}`);

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        referralCode: user.referralCode,
        is_admin: isAdmin, // Ensure admin status is properly set
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "24h" }, // Extended token expiry for better UX
      (err, token) => {
        if (err) {
          console.error("JWT signing error:", err);
          return res.status(500).json({
            success: false,
            message: "Error generating authentication token",
          });
        }

        res.json({
          success: true,
          message: "Login successful",
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            referralCode: user.referralCode,
            coins: user.coins || 0,
            referralCount: user.referralCount || 0,
            is_admin: isAdmin,
            adminConfirmed: isAdmin, // Additional confirmation field
          },
        });
      }
    );
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({
      success: false,
      message: "Error logging in",
      error: error.message,
    });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -otp -otpExpiry")
      .populate("referralHistory.referredUser", "name email");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Re-validate admin status
    const isAdmin = checkIsAdmin(user.email);

    res.json({
      success: true,
      message: `Welcome to the dashboard, ${user.name}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        coins: user.coins || 0,
        referralCount: user.referralCount || 0,
        referralHistory: user.referralHistory || [],
        is_admin: isAdmin,
        adminConfirmed: req.user.adminConfirmed || false,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// getUserCounts - Enhanced with admin check
exports.getUserCounts = async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required to view user counts",
      });
    }

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
        requestedBy: {
          name: req.user.name,
          email: req.user.email,
          isAdmin: req.user.is_admin,
        },
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

// Export the checkIsAdmin function for use in other modules
exports.checkIsAdmin = checkIsAdmin;
