const User = require("../models/User");
const {
  getReferralStats,
  verifyReferralCode,
} = require("../utils/referralUtils");

// Get user's referral statistics
exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await getReferralStats(userId);

    if (!result.success) {
      return res.status(400).json({ message: result.message || result.error });
    }

    res.json({
      message: "Referral stats retrieved successfully",
      data: result.stats,
    });
  } catch (error) {
    console.error("Error getting referral stats:", error);
    res.status(500).json({
      message: "Error retrieving referral stats",
      error: error.message,
    });
  }
};

// Verify if a referral code is valid
exports.verifyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.params;
    const result = await verifyReferralCode(referralCode);

    if (!result.valid) {
      return res.status(400).json({
        valid: false,
        message: result.message,
      });
    }

    res.json({
      valid: true,
      message: result.message,
      referrer: {
        name: result.referrer.name,
        referralCode: result.referrer.referralCode,
      },
    });
  } catch (error) {
    console.error("Error verifying referral code:", error);
    res.status(500).json({
      valid: false,
      message: "Error verifying referral code",
      error: error.message,
    });
  }
};

// Get referral leaderboard (top referrers)
exports.getReferralLeaderboard = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const topReferrers = await User.find({
      isVerified: true,
      referralCount: { $gt: 0 },
    })
      .select("name referralCode referralCount coins")
      .sort({ referralCount: -1, coins: -1 })
      .limit(parseInt(limit));

    res.json({
      message: "Referral leaderboard retrieved successfully",
      data: topReferrers.map((user, index) => ({
        rank: index + 1,
        name: user.name,
        referralCode: user.referralCode,
        totalReferrals: user.referralCount,
        totalCoins: user.coins,
      })),
    });
  } catch (error) {
    console.error("Error getting referral leaderboard:", error);
    res.status(500).json({
      message: "Error retrieving referral leaderboard",
      error: error.message,
    });
  }
};

// Get user's referral history with pagination
exports.getReferralHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId)
      .select("referralHistory")
      .slice("referralHistory", [skip, parseInt(limit)])
      .populate("referralHistory.referredUser", "name email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const totalReferrals = await User.findById(userId).select("referralCount");

    res.json({
      message: "Referral history retrieved successfully",
      data: {
        referralHistory: user.referralHistory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((totalReferrals.referralCount || 0) / limit),
          totalReferrals: totalReferrals.referralCount || 0,
          hasMore:
            skip + user.referralHistory.length <
            (totalReferrals.referralCount || 0),
        },
      },
    });
  } catch (error) {
    console.error("Error getting referral history:", error);
    res.status(500).json({
      message: "Error retrieving referral history",
      error: error.message,
    });
  }
};
