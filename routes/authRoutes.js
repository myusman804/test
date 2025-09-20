const express = require("express");
const {
  register,
  verifyOTP,
  resendOTP,
  login,
  logout,
  dashboard,
  getUserCounts,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  requireAdmin,
  checkAdminStatus,
} = require("../middleware/adminMiddleware");
const {
  validateRegistration,
  validateLogin,
  validateOTP,
} = require("../middleware/validation");

const router = express.Router();

console.log("[v0] Setting up auth routes...");

// Public routes
router.post("/register", validateRegistration, register);
console.log("[v0] POST /register route defined");

router.post("/verify-otp", validateOTP, verifyOTP);
router.post("/resend-otp", validateOTP, resendOTP);
router.post("/login", validateLogin, login);
router.post("/logout", logout);

// Protected routes
router.get("/dashboard", authMiddleware, checkAdminStatus, dashboard);

router.get("/users-count", authMiddleware, requireAdmin, getUserCounts);

router.get("/verify-admin", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Admin status verified",
    data: {
      isAdmin: req.user.is_admin || false,
      adminConfirmed: req.user.adminConfirmed || false,
      user: {
        name: req.user.name,
        email: req.user.email,
      },
    },
  });
});

router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Auth routes are healthy",
    timestamp: new Date().toISOString(),
  });
});

console.log("[v0] Auth routes setup complete");

module.exports = router;
