const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs"); // Import bcryptjs for password hashing
const jwt = require("jsonwebtoken"); // Import jsonwebtoken for JWT creation
const {
  createVerificationEmailHTML,
  createResendOTPEmailHTML,
} = require("../templete/emailTemplete");

// Email Transporter Setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Use environment variable
    pass: process.env.EMAIL_PASS, // Use environment variable
  },
});

// Generate OTP
const generateOTP = () => crypto.randomInt(100000, 999999).toString();

// Register User and Send OTP
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    // Hash password before saving
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

    user = new User({ name, email, password: hashedPassword, otp, otpExpiry });
    await user.save();

    // Send HTML email using the imported template function
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "🔐 Verify Your AdsMoney Account",
      html: createVerificationEmailHTML(name, otp),
      text: `Hi ${name}, Your AdsMoney verification code is: ${otp}. This code will expire in 2 minutes.`, // Fallback plain text
    });

    res.status(201).json({
      message:
        "User registered successfully! Please check your email for the verification code.",
      email: email,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
};

// Verify OTP
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

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res
      .status(500)
      .json({ message: "Error verifying OTP", error: error.message });
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
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // New OTP valid for 10 minutes
    await user.save();

    // Send resend email using the imported HTML template function
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "🔄 Your New AdsMoney Verification Code",
      html: createResendOTPEmailHTML(user.name, otp),
      text: `Hi ${user.name}, Your new AdsMoney verification code is: ${otp}. This code will expire in 10 minutes.`, // Fallback plain text
    });

    res.json({ message: "OTP resent successfully." });
  } catch (error) {
    console.error("Error resending OTP:", error);
    res
      .status(500)
      .json({ message: "Error resending OTP", error: error.message });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "Invalid credentials" }); // More generic message for security

    // Compare provided password with hashed password in DB
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" }); // More generic message for security
    }

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ message: "Email not verified. Please verify OTP." });
    }

    // Generate JWT
    const payload = {
      user: {
        id: user.id, // Mongoose uses 'id' for _id by default
        email: user.email,
        name: user.name,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET, // Use environment variable for secret
      { expiresIn: "1h" }, // Token expires in 1 hour
      (err, token) => {
        if (err) throw err;
        res.json({ message: "Login successful", token }); // Send token in response
      }
    );
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
};

// Logout User (JWTs are stateless, so logout is client-side by deleting the token)
exports.logout = (req, res) => {
  // For JWT, logout is typically handled on the client by deleting the token.
  // This endpoint can be used for any server-side cleanup if necessary,
  // but it doesn't invalidate the token itself.
  res.json({ message: "Logged out successfully" });
};

// Dashboard (Protected Route)
// Dashboard (Protected Route)
exports.dashboard = async (req, res) => {
  try {
    // req.user is populated by the authMiddleware
    res.json({
      message: `Welcome to the dashboard, ${req.user.name || req.user.email}`,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
