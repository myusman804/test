const express = require("express");
const {
  getReferralStats,
  verifyReferralCode,
  getReferralLeaderboard,
  getReferralHistory,
  getReferralAnalytics,
} = require("../controllers/referralController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  validateReferralCode,
  validatePagination,
} = require("../middleware/validation");

const router = express.Router();

// Protected routes (require authentication)
router.get("/stats", authMiddleware, getReferralStats);
router.get("/history", authMiddleware, validatePagination, getReferralHistory);
router.get("/analytics", authMiddleware, getReferralAnalytics);

// Public routes - simplified parameter syntax
router.get("/verify/:code", validateReferralCode, verifyReferralCode);
router.get("/leaderboard", validatePagination, getReferralLeaderboard);

// Health check route
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Referral routes are healthy",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
