const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

// Get referral stats for authenticated user
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("referralCode coins referralCount referralHistory")
      .populate("referralHistory.referredUser", "name email");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        coins: user.coins || 0,
        referralCount: user.referralCount || 0,
        referralHistory: user.referralHistory || [],
      },
    });
  } catch (error) {
    console.error("Error getting referral stats:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving referral stats",
    });
  }
});

// Get referral history with pagination
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id).populate({
      path: "referralHistory.referredUser",
      select: "name email",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const totalReferrals = user.referralHistory?.length || 0;
    const referralHistory =
      user.referralHistory?.slice(skip, skip + limit) || [];

    res.json({
      success: true,
      data: {
        referrals: referralHistory,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalReferrals / limit),
          totalReferrals,
          hasNext: skip + limit < totalReferrals,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error getting referral history:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving referral history",
    });
  }
});

// Verify referral code (public endpoint)
router.get("/verify/:code", async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        valid: false,
        message: "Referral code is required",
      });
    }

    const referrer = await User.findOne({
      referralCode: code.toUpperCase(),
      isVerified: true,
    }).select("name email referralCode");

    if (!referrer) {
      return res.status(404).json({
        valid: false,
        message: "Invalid or expired referral code",
      });
    }

    res.json({
      valid: true,
      message: "Valid referral code",
      referrer: {
        name: referrer.name,
        referralCode: referrer.referralCode,
      },
    });
  } catch (error) {
    console.error("Error verifying referral code:", error);
    res.status(500).json({
      valid: false,
      message: "Error verifying referral code",
    });
  }
});

// Get leaderboard (public endpoint)
router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit) || 10;

    const leaderboard = await User.find({
      isVerified: true,
      referralCount: { $gt: 0 },
    })
      .select("name referralCount coins")
      .sort({ referralCount: -1, coins: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: leaderboard.map((user, index) => ({
        rank: index + 1,
        name: user.name,
        referralCount: user.referralCount || 0,
        coins: user.coins || 0,
      })),
    });
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving leaderboard",
      data: [],
    });
  }
});

// Get referral analytics (admin only)
router.get("/analytics", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ isVerified: true });
    const usersWithReferrals = await User.countDocuments({
      isVerified: true,
      referralCount: { $gt: 0 },
    });

    const referralStats = await User.aggregate([
      { $match: { isVerified: true } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: "$referralCount" },
          totalCoinsDistributed: { $sum: "$coins" },
          avgReferralsPerUser: { $avg: "$referralCount" },
        },
      },
    ]);

    const stats = referralStats[0] || {
      totalReferrals: 0,
      totalCoinsDistributed: 0,
      avgReferralsPerUser: 0,
    };

    res.json({
      success: true,
      data: {
        totalUsers,
        usersWithReferrals,
        referralRate:
          totalUsers > 0
            ? ((usersWithReferrals / totalUsers) * 100).toFixed(2)
            : 0,
        ...stats,
      },
    });
  } catch (error) {
    console.error("Error getting referral analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving referral analytics",
    });
  }
});

module.exports = router;
