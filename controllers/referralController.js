const User = require("../models/User");
const {
  getReferralStats: getReferralStatsUtil,
  verifyReferralCode: verifyReferralCodeUtil,
} = require("../utils/referralUtils");

exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await getReferralStatsUtil(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || result.error,
      });
    }

    res.json({
      success: true,
      message: "Referral stats retrieved successfully",
      data: result.stats,
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve referral stats",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

exports.verifyReferralCode = async (req, res) => {
  try {
    const { code } = req.params;
    const result = await verifyReferralCodeUtil(code);

    if (!result.valid) {
      return res.status(400).json({
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

exports.getReferralLeaderboard = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const topReferrers = await User.find({
      isVerified: true,
      isActive: true,
      referralCount: { $gt: 0 },
    })
      .select("name referralCode referralCount coins createdAt")
      .sort({ referralCount: -1, coins: -1, createdAt: 1 })
      .skip(skip)
      .limit(Number.parseInt(limit))
      .lean();

    const totalCount = await User.countDocuments({
      isVerified: true,
      isActive: true,
      referralCount: { $gt: 0 },
    });

    const leaderboard = topReferrers.map((user, index) => ({
      rank: skip + index + 1,
      name: user.name,
      referralCode: user.referralCode,
      totalReferrals: user.referralCount,
      totalCoins: user.coins,
      memberSince: user.createdAt,
    }));

    res.json({
      success: true,
      message: "Referral leaderboard retrieved successfully",
      data: {
        leaderboard,
        pagination: {
          currentPage: Number.parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalUsers: totalCount,
          hasMore: skip + topReferrers.length < totalCount,
        },
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

exports.getReferralHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      sortBy = "referredAt",
      sortOrder = "desc",
    } = req.query;
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[`referralHistory.${sortBy}`] = sortOrder === "desc" ? -1 : 1;

    const user = await User.findById(userId)
      .select("referralHistory referralCount")
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

    // Sort and paginate referral history
    const sortedHistory = user.referralHistory.sort((a, b) => {
      if (sortOrder === "desc") {
        return new Date(b.referredAt) - new Date(a.referredAt);
      }
      return new Date(a.referredAt) - new Date(b.referredAt);
    });

    const paginatedHistory = sortedHistory.slice(
      skip,
      skip + Number.parseInt(limit)
    );
    const totalReferrals = user.referralCount || 0;

    res.json({
      success: true,
      message: "Referral history retrieved successfully",
      data: {
        referralHistory: paginatedHistory,
        pagination: {
          currentPage: Number.parseInt(page),
          totalPages: Math.ceil(totalReferrals / limit),
          totalReferrals,
          hasMore: skip + paginatedHistory.length < totalReferrals,
        },
        summary: {
          totalReferrals,
          totalCoinsEarned: paginatedHistory.reduce(
            (sum, ref) => sum + (ref.coinsEarned || 0),
            0
          ),
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

exports.getReferralAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = "30" } = req.query; // days

    const user = await User.findById(userId)
      .select("referralHistory referralCount coins")
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

    const periodDays = Number.parseInt(period);
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Filter referrals within the period
    const periodReferrals = user.referralHistory.filter(
      (ref) => new Date(ref.referredAt) >= periodStart
    );

    // Calculate analytics
    const analytics = {
      period: `${periodDays} days`,
      totalReferrals: user.referralCount || 0,
      periodReferrals: periodReferrals.length,
      totalCoins: user.coins || 0,
      periodCoinsEarned: periodReferrals.reduce(
        (sum, ref) => sum + (ref.coinsEarned || 0),
        0
      ),
      conversionRate:
        user.referralCount > 0
          ? (
              (periodReferrals.filter((ref) => ref.referredUser?.isVerified)
                .length /
                periodReferrals.length) *
              100
            ).toFixed(2)
          : 0,
      averageCoinsPerReferral:
        user.referralCount > 0
          ? ((user.coins || 0) / user.referralCount).toFixed(2)
          : 0,
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
