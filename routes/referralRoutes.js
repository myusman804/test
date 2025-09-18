const express = require("express");
const {
  getReferralStats,
  verifyReferralCode,
  getReferralLeaderboard,
  getReferralHistory,
} = require("../controllers/referralController");
const authMiddleware = require("../middleware/authmiddleware");

const router = express.Router();

// Protected routes (require authentication)
router.get("/stats", authMiddleware, getReferralStats);
router.get("/history", authMiddleware, getReferralHistory);

// Public routes
router.get("/verify/:referralCode", verifyReferralCode);
router.get("/leaderboard", getReferralLeaderboard);

module.exports = router;
