const User = require("../models/User");
const {
  getReferralStats: getReferralStatsUtil,
  verifyReferralCode: verifyReferralCodeUtil,
  canUserRefer,
} = require("../utils/referralUtils");

// Get referral stats for authenticated user
const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user can refer (is verified and active)
    const canRefer = await canUserRefer(userId);
    if (!canRefer) {
      return res.status(403).json({
        success: false,
        message:
          "Your account must be verified and active to access referral features",
      });
    }

    const result = await getReferralStatsUtil(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || result.error,
      });
    }

    res.json({
      success: true,
      message: "Referral statistics retrieved successfully",
      data: {
        ...result.stats,
        canRefer: true,
        referralTips: [
          "Share your referral link on social media",
          "Tell friends about Party-Support benefits",
          "Each successful referral earns you coins",
        ],
      },
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve referral statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Verify referral code
const verifyReferralCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Referral code is required",
      });
    }

    const result = await verifyReferralCodeUtil(code.trim());

    if (!result.valid) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      valid: true,
      message: result.message,
      data: {
        referrer: {
          name: result.referrer.name,
          referralCode: result.referrer.referralCode,
          memberSince: result.referrer.createdAt,
        },
        reward: {
          coinsForReferrer: process.env.REFERRAL_REWARD_COINS || 10,
          bonusForNewUser: "Welcome bonus on verification",
        },
      },
    });
  } catch (error) {
    console.error("Verify referral code error:", error);
    res.status(500).json({
      success: false,
      valid: false,
      message: "Error verifying referral code",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get referral leaderboard
const getReferralLeaderboard = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50); // Max 50 results
    const parsedPage = Math.max(parseInt(page), 1);
    const skip = (parsedPage - 1) * parsedLimit;

    // Validate pagination parameters
    if (isNaN(parsedLimit) || isNaN(parsedPage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    const [topReferrers, totalCount] = await Promise.all([
      User.find({
        isVerified: true,
        isActive: true,
        referralCount: { $gt: 0 },
      })
        .select("name referralCode referralCount coins createdAt")
        .sort({ referralCount: -1, coins: -1, createdAt: 1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),

      User.countDocuments({
        isVerified: true,
        isActive: true,
        referralCount: { $gt: 0 },
      }),
    ]);

    const leaderboard = topReferrers.map((user, index) => ({
      rank: skip + index + 1,
      name: user.name,
      referralCode: user.referralCode,
      totalReferrals: user.referralCount,
      totalCoins: user.coins,
      memberSince: user.createdAt,
      // Add badge for top performers
      badge:
        skip + index + 1 <= 3
          ? ["🥇", "🥈", "🥉"][skip + index]
          : user.referralCount >= 10
          ? "⭐"
          : null,
    }));

    res.json({
      success: true,
      message: "Referral leaderboard retrieved successfully",
      data: {
        leaderboard,
        pagination: {
          currentPage: parsedPage,
          totalPages: Math.ceil(totalCount / parsedLimit),
          totalUsers: totalCount,
          hasMore: skip + topReferrers.length < totalCount,
          hasPrevious: parsedPage > 1,
          limit: parsedLimit,
        },
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get referral leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve referral leaderboard",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get referral history for authenticated user
const getReferralHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      sortBy = "referredAt",
      sortOrder = "desc",
      filter = "all",
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit), 50);
    const parsedPage = Math.max(parseInt(page), 1);
    const skip = (parsedPage - 1) * parsedLimit;

    // Validate sort parameters
    const validSortFields = ["referredAt", "coinsEarned", "referredUserName"];
    const validSortOrders = ["asc", "desc"];

    if (
      !validSortFields.includes(sortBy) ||
      !validSortOrders.includes(sortOrder)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort parameters",
      });
    }

    const user = await User.findById(userId)
      .select("referralHistory referralCount name")
      .populate({
        path: "referralHistory.referredUser",
        select: "name email createdAt isVerified isActive",
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let referralHistory = user.referralHistory || [];

    // Apply filters
    if (filter === "verified") {
      referralHistory = referralHistory.filter(
        (ref) => ref.referredUser?.isVerified
      );
    } else if (filter === "unverified") {
      referralHistory = referralHistory.filter(
        (ref) => !ref.referredUser?.isVerified
      );
    } else if (filter === "recent") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      referralHistory = referralHistory.filter(
        (ref) => new Date(ref.referredAt) >= thirtyDaysAgo
      );
    }

    // Sort referral history
    referralHistory.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === "referredAt") {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (sortOrder === "desc") {
        return bValue > aValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });

    // Apply pagination
    const totalReferrals = referralHistory.length;
    const paginatedHistory = referralHistory.slice(skip, skip + parsedLimit);

    // Calculate summary statistics
    const totalCoinsEarned = referralHistory.reduce(
      (sum, ref) => sum + (ref.coinsEarned || 0),
      0
    );

    const verifiedReferrals = referralHistory.filter(
      (ref) => ref.referredUser?.isVerified
    ).length;

    const recentReferrals = referralHistory.filter((ref) => {
      const referralDate = new Date(ref.referredAt);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return referralDate >= sevenDaysAgo;
    }).length;

    res.json({
      success: true,
      message: "Referral history retrieved successfully",
      data: {
        referralHistory: paginatedHistory.map((ref) => ({
          ...ref,
          status: ref.referredUser?.isVerified ? "verified" : "pending",
          joinedAgo: getTimeAgo(ref.referredAt),
        })),
        pagination: {
          currentPage: parsedPage,
          totalPages: Math.ceil(totalReferrals / parsedLimit),
          totalReferrals,
          hasMore: skip + paginatedHistory.length < totalReferrals,
          hasPrevious: parsedPage > 1,
          limit: parsedLimit,
        },
        summary: {
          totalReferrals: user.referralCount || 0,
          totalCoinsEarned,
          verifiedReferrals,
          pendingReferrals: (user.referralCount || 0) - verifiedReferrals,
          recentReferrals,
          conversionRate:
            user.referralCount > 0
              ? ((verifiedReferrals / user.referralCount) * 100).toFixed(1)
              : 0,
        },
        filters: {
          current: filter,
          available: ["all", "verified", "unverified", "recent"],
        },
      },
    });
  } catch (error) {
    console.error("Get referral history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve referral history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get referral analytics for authenticated user
const getReferralAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = "30" } = req.query;
    const periodDays = Math.min(parseInt(period), 365); // Max 1 year

    if (isNaN(periodDays) || periodDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid period parameter",
      });
    }

    const user = await User.findById(userId)
      .select("referralHistory referralCount coins name createdAt")
      .populate({
        path: "referralHistory.referredUser",
        select: "createdAt isVerified",
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const referralHistory = user.referralHistory || [];

    // Filter referrals within the period
    const periodReferrals = referralHistory.filter(
      (ref) => new Date(ref.referredAt) >= periodStart
    );

    // Calculate daily referral counts for chart data
    const dailyReferrals = {};
    for (let i = 0; i < periodDays; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      dailyReferrals[dateKey] = 0;
    }

    periodReferrals.forEach((ref) => {
      const dateKey = new Date(ref.referredAt).toISOString().split("T")[0];
      if (dailyReferrals.hasOwnProperty(dateKey)) {
        dailyReferrals[dateKey]++;
      }
    });

    const chartData = Object.entries(dailyReferrals)
      .map(([date, count]) => ({ date, referrals: count }))
      .reverse(); // Most recent first

    // Calculate analytics
    const verifiedPeriodReferrals = periodReferrals.filter(
      (ref) => ref.referredUser?.isVerified
    ).length;

    const periodCoinsEarned = periodReferrals.reduce(
      (sum, ref) => sum + (ref.coinsEarned || 0),
      0
    );

    const analytics = {
      period: {
        days: periodDays,
        startDate: periodStart.toISOString(),
        endDate: new Date().toISOString(),
      },
      totals: {
        allTimeReferrals: user.referralCount || 0,
        allTimeCoins: user.coins || 0,
        periodReferrals: periodReferrals.length,
        periodCoinsEarned,
      },
      performance: {
        conversionRate:
          periodReferrals.length > 0
            ? (
                (verifiedPeriodReferrals / periodReferrals.length) *
                100
              ).toFixed(2)
            : 0,
        averageCoinsPerReferral:
          user.referralCount > 0
            ? ((user.coins || 0) / user.referralCount).toFixed(2)
            : 0,
        dailyAverage: (periodReferrals.length / periodDays).toFixed(2),
      },
      trends: {
        chartData,
        bestDay: chartData.reduce(
          (best, current) =>
            current.referrals > best.referrals ? current : best,
          { date: null, referrals: 0 }
        ),
        totalDaysActive: chartData.filter((day) => day.referrals > 0).length,
      },
      milestones: {
        next: getNextMilestone(user.referralCount || 0),
        achieved: getAchievedMilestones(user.referralCount || 0),
      },
    };

    res.json({
      success: true,
      message: "Referral analytics retrieved successfully",
      data: analytics,
    });
  } catch (error) {
    console.error("Get referral analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve referral analytics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function to get time ago string
const getTimeAgo = (date) => {
  const now = new Date();
  const diffTime = Math.abs(now - new Date(date));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
};

// Helper function to get next milestone
const getNextMilestone = (currentCount) => {
  const milestones = [5, 10, 25, 50, 100, 250, 500, 1000];
  const next = milestones.find((milestone) => milestone > currentCount);
  return next
    ? {
        count: next,
        remaining: next - currentCount,
        reward: `${next * 10} bonus coins`,
      }
    : {
        count: "∞",
        remaining: 0,
        reward: "You're a referral champion!",
      };
};

// Helper function to get achieved milestones
const getAchievedMilestones = (currentCount) => {
  const milestones = [
    { count: 1, title: "First Referral", badge: "🎯" },
    { count: 5, title: "Rising Star", badge: "⭐" },
    { count: 10, title: "Referral Pro", badge: "💫" },
    { count: 25, title: "Growth Hacker", badge: "🚀" },
    { count: 50, title: "Community Builder", badge: "🏗️" },
    { count: 100, title: "Referral Master", badge: "👑" },
    { count: 250, title: "Legend", badge: "🏆" },
    { count: 500, title: "Champion", badge: "🥇" },
    { count: 1000, title: "Hall of Fame", badge: "🌟" },
  ];

  return milestones.filter((milestone) => currentCount >= milestone.count);
};

module.exports = {
  getReferralStats,
  verifyReferralCode,
  getReferralLeaderboard,
  getReferralHistory,
  getReferralAnalytics,
};
