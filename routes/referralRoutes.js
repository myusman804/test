const express = require("express");
const {
  getReferralStats,
  verifyReferralCode,
  getReferralLeaderboard,
  getReferralHistory,
  getReferralAnalytics,
} = require("../controllers/referralController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const {
  validateReferralCode,
  validatePagination,
  validateAnalyticsQuery,
  sanitizeInput,
} = require("../middleware/validation");
const {
  referralLimiter,
  docsLimiter,
  adminLimiter,
} = require("../middleware/rateLimiter");

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeInput);

console.log("🔗 Setting up referral routes...");

// ===== PUBLIC ROUTES =====

// Verify referral code (public endpoint for registration)
router.get(
  "/verify/:code",
  referralLimiter,
  validateReferralCode,
  verifyReferralCode
);
console.log("✅ GET /verify/:code route registered");

// Get referral leaderboard (public)
router.get(
  "/leaderboard",
  docsLimiter, // More lenient rate limiting for public data
  validatePagination,
  getReferralLeaderboard
);
console.log("✅ GET /leaderboard route registered");

// Get referral program information (public)
router.get("/info", docsLimiter, (req, res) => {
  res.json({
    success: true,
    message: "Referral program information",
    data: {
      program: {
        name: "AdsMoney Referral Program",
        description: "Earn coins by referring friends to AdsMoney",
        version: "2.0.0",
      },
      rewards: {
        baseReward: parseInt(process.env.REFERRAL_REWARD_COINS) || 10,
        currency: "coins",
        bonusThresholds: [
          { referrals: 5, bonus: 25, description: "First milestone bonus" },
          { referrals: 10, bonus: 50, description: "Growth achiever bonus" },
          { referrals: 25, bonus: 100, description: "Community builder bonus" },
          { referrals: 50, bonus: 250, description: "Referral master bonus" },
          { referrals: 100, bonus: 500, description: "Champion bonus" },
        ],
      },
      requirements: {
        referrerMustBeVerified: true,
        newUserMustVerifyEmail: true,
        uniqueEmailsOnly: true,
        cooldownPeriod: "none",
      },
      statistics: {
        totalProgramMembers: "Available via /leaderboard",
        topReferrer: "Check leaderboard for current champion",
        averageReferralsPerUser: "Available in admin statistics",
      },
      howItWorks: [
        "Sign up and get your unique referral code",
        "Share your referral link with friends",
        "When friends register using your code, you both benefit",
        "Earn coins when your referrals verify their email",
        "Track your progress on your dashboard",
        "Climb the leaderboard to become a referral champion",
      ],
      tips: [
        "Share on social media for maximum reach",
        "Explain the benefits of AdsMoney to friends",
        "Follow up to help friends complete verification",
        "Quality referrals work better than quantity",
        "Check your analytics to optimize your strategy",
      ],
    },
  });
});
console.log("✅ GET /info route registered");

// ===== PROTECTED ROUTES (Authenticated Users) =====

// Get user's referral statistics
router.get("/stats", authMiddleware, referralLimiter, getReferralStats);
console.log("✅ GET /stats route registered");

// Get user's referral history
router.get(
  "/history",
  authMiddleware,
  referralLimiter,
  validatePagination,
  getReferralHistory
);
console.log("✅ GET /history route registered");

// Get user's referral analytics
router.get(
  "/analytics",
  authMiddleware,
  referralLimiter,
  validateAnalyticsQuery,
  getReferralAnalytics
);
console.log("✅ GET /analytics route registered");

// Get user's referral link
router.get("/link", authMiddleware, (req, res) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const referralLink = `${frontendUrl}/register?ref=${req.user.referralCode}`;

    res.json({
      success: true,
      message: "Referral link retrieved successfully",
      data: {
        referralCode: req.user.referralCode,
        referralLink,
        shareableMessage: `Join me on AdsMoney and start earning! Use my referral code: ${req.user.referralCode}`,
        socialShareUrls: {
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            referralLink
          )}`,
          twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(
            referralLink
          )}&text=${encodeURIComponent(
            `Join me on AdsMoney! Use code: ${req.user.referralCode}`
          )}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
            referralLink
          )}`,
          whatsapp: `https://wa.me/?text=${encodeURIComponent(
            `Join me on AdsMoney and start earning! ${referralLink}`
          )}`,
        },
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
          referralLink
        )}`,
      },
    });
  } catch (error) {
    console.error("Get referral link error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate referral link",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
console.log("✅ GET /link route registered");

// Get referral performance summary
router.get(
  "/performance",
  authMiddleware,
  referralLimiter,
  async (req, res) => {
    try {
      const User = require("../models/User");
      const user = await User.findById(req.user.id)
        .select(
          "referralCount coins totalEarned referralHistory successfulReferrals"
        )
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Calculate performance metrics
      const totalReferrals = user.referralCount || 0;
      const successfulReferrals = user.successfulReferrals || 0;
      const conversionRate =
        totalReferrals > 0
          ? ((successfulReferrals / totalReferrals) * 100).toFixed(1)
          : 0;

      // Recent activity (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentReferrals = (user.referralHistory || []).filter(
        (ref) => new Date(ref.referredAt) >= thirtyDaysAgo
      );

      // Calculate rank
      const betterUsers = await User.countDocuments({
        referralCount: { $gt: totalReferrals },
        isVerified: true,
        isActive: true,
      });
      const rank = betterUsers + 1;

      // Next milestone
      const milestones = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
      const nextMilestone = milestones.find((m) => m > totalReferrals);

      res.json({
        success: true,
        message: "Performance summary retrieved successfully",
        data: {
          overview: {
            totalReferrals,
            successfulReferrals,
            conversionRate: `${conversionRate}%`,
            totalCoinsEarned: user.coins || 0,
            rank,
          },
          recent: {
            last30Days: recentReferrals.length,
            trend: recentReferrals.length > 0 ? "active" : "inactive",
          },
          milestones: {
            current: milestones.filter((m) => m <= totalReferrals),
            next: nextMilestone
              ? {
                  target: nextMilestone,
                  remaining: nextMilestone - totalReferrals,
                  progress: ((totalReferrals / nextMilestone) * 100).toFixed(1),
                }
              : null,
          },
          badges: getBadges(totalReferrals, successfulReferrals),
        },
      });
    } catch (error) {
      console.error("Get performance error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve performance data",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /performance route registered");

// ===== ADMIN ROUTES =====

// Get comprehensive referral analytics (Admin only)
router.get(
  "/admin/analytics",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const { period = "30" } = req.query;
      const User = require("../models/User");

      const periodDays = parseInt(period);
      const periodStart = new Date(
        Date.now() - periodDays * 24 * 60 * 60 * 1000
      );

      // Get comprehensive statistics
      const [userStats, recentActivity, topPerformers] = await Promise.all([
        User.getUserStats(),
        User.aggregate([
          {
            $match: {
              createdAt: { $gte: periodStart },
              deletedAt: null,
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              newUsers: { $sum: 1 },
              newReferrals: { $sum: "$referralCount" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        User.find({
          referralCount: { $gte: 5 },
          isVerified: true,
          isActive: true,
        })
          .select(
            "name email referralCount successfulReferrals coins createdAt"
          )
          .sort({ referralCount: -1 })
          .limit(20)
          .lean(),
      ]);

      res.json({
        success: true,
        message: "Admin analytics retrieved successfully",
        data: {
          period: `${periodDays} days`,
          overview: userStats,
          activity: recentActivity,
          topPerformers: topPerformers.map((user, index) => ({
            rank: index + 1,
            name: user.name,
            email: user.email,
            totalReferrals: user.referralCount,
            successfulReferrals: user.successfulReferrals,
            conversionRate:
              user.referralCount > 0
                ? (
                    (user.successfulReferrals / user.referralCount) *
                    100
                  ).toFixed(1)
                : 0,
            totalCoins: user.coins,
            memberSince: user.createdAt,
          })),
          generatedAt: new Date().toISOString(),
          generatedBy: {
            name: req.user.name,
            email: req.user.email,
          },
        },
      });
    } catch (error) {
      console.error("Admin analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve admin analytics",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /admin/analytics route registered");

// Manually process referral reward (Admin only)
router.post(
  "/admin/process-reward",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const { referrerId, referredUserId, coinsAmount = 10 } = req.body;
      const { processReferralReward } = require("../utils/referralUtils");

      if (!referrerId || !referredUserId) {
        return res.status(400).json({
          success: false,
          message: "Both referrerId and referredUserId are required",
        });
      }

      const result = await processReferralReward(referrerId, referredUserId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || "Failed to process referral reward",
        });
      }

      // Log admin action
      console.log(
        `👑 Admin ${req.user.email} manually processed referral reward`,
        {
          referrerId,
          referredUserId,
          coinsAmount,
          processedAt: new Date().toISOString(),
        }
      );

      res.json({
        success: true,
        message: "Referral reward processed successfully",
        data: {
          coinsAwarded: result.coinsEarned,
          processedBy: req.user.email,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Process referral reward error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process referral reward",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ POST /admin/process-reward route registered");

// ===== UTILITY ROUTES =====

// Health check for referral service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Referral service is healthy",
    timestamp: new Date().toISOString(),
    service: "referral",
  });
});

// Helper function to determine user badges
function getBadges(totalReferrals, successfulReferrals) {
  const badges = [];

  if (totalReferrals >= 1)
    badges.push({
      name: "First Referral",
      icon: "🎯",
      description: "Made your first referral",
    });
  if (totalReferrals >= 5)
    badges.push({
      name: "Rising Star",
      icon: "⭐",
      description: "Reached 5 referrals",
    });
  if (totalReferrals >= 10)
    badges.push({
      name: "Referral Pro",
      icon: "💫",
      description: "Achieved 10 referrals",
    });
  if (totalReferrals >= 25)
    badges.push({
      name: "Growth Hacker",
      icon: "🚀",
      description: "Hit 25 referrals",
    });
  if (totalReferrals >= 50)
    badges.push({
      name: "Community Builder",
      icon: "🏗️",
      description: "Built a network of 50",
    });
  if (totalReferrals >= 100)
    badges.push({
      name: "Referral Master",
      icon: "👑",
      description: "Mastered referrals with 100+",
    });
  if (totalReferrals >= 250)
    badges.push({
      name: "Legend",
      icon: "🏆",
      description: "Legendary referrer",
    });
  if (totalReferrals >= 500)
    badges.push({
      name: "Champion",
      icon: "🥇",
      description: "Referral champion",
    });

  // Special badges
  if (successfulReferrals >= 10 && totalReferrals > 0) {
    const conversionRate = (successfulReferrals / totalReferrals) * 100;
    if (conversionRate >= 80)
      badges.push({
        name: "Quality Expert",
        icon: "💎",
        description: "High conversion rate",
      });
  }

  return badges;
}

console.log("🎉 Referral routes setup completed successfully!");

module.exports = router;
