const crypto = require("crypto");
const User = require("../models/User");

const generateReferralCode = (name, email) => {
  try {
    // Ensure inputs are valid
    if (!name || !email) {
      throw new Error(
        "Name and email are required for referral code generation"
      );
    }

    const timestamp = Date.now().toString();
    const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();

    // Clean and prepare name prefix
    const cleanName = name.replace(/[^A-Za-z]/g, "").toUpperCase();
    const namePrefix = cleanName.length >= 2 ? cleanName.substring(0, 2) : "XX";

    // Get email prefix
    const emailPrefix = email.charAt(0).toUpperCase();

    return `${namePrefix}${emailPrefix}${randomStr}${timestamp.slice(-3)}`;
  } catch (error) {
    console.error("Error generating referral code:", error);
    // Fallback generation method
    const fallbackCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    return `REF${fallbackCode}`;
  }
};

const verifyReferralCode = async (referralCode) => {
  try {
    if (!referralCode || typeof referralCode !== "string") {
      return { valid: false, message: "No referral code provided" };
    }

    const cleanCode = referralCode.trim().toUpperCase();
    if (cleanCode.length < 3) {
      return { valid: false, message: "Invalid referral code format" };
    }

    const referrer = await User.findOne({
      referralCode: cleanCode,
      isVerified: true,
      isActive: true,
    }).select("_id name referralCode email");

    if (!referrer) {
      return { valid: false, message: "Invalid or inactive referral code" };
    }

    return {
      valid: true,
      referrer,
      message: `Valid referral code from ${referrer.name}`,
    };
  } catch (error) {
    console.error("Error verifying referral code:", error);
    return { valid: false, message: "Error verifying referral code" };
  }
};

const processReferralReward = async (referrerId, newUserId) => {
  if (!referrerId || !newUserId) {
    throw new Error("Both referrer ID and new user ID are required");
  }

  const session = await User.db.startSession();

  try {
    const result = await session.withTransaction(async () => {
      // Get both users within transaction
      const referrer = await User.findById(referrerId).session(session);
      const newUser = await User.findById(newUserId).session(session);

      if (!referrer || !newUser) {
        throw new Error("User not found during referral processing");
      }

      if (!referrer.isVerified || !referrer.isActive) {
        throw new Error("Referrer is not active or verified");
      }

      if (!newUser.isVerified) {
        throw new Error(
          "New user must be verified before processing referral reward"
        );
      }

      // Check if referral reward has already been processed
      const existingReferral = referrer.referralHistory.find(
        (ref) => ref.referredUser.toString() === newUserId.toString()
      );

      if (existingReferral) {
        console.log("Referral reward already processed for this user");
        return { success: true, coinsEarned: 0, alreadyProcessed: true };
      }

      const REFERRAL_REWARD = 10;

      // Update referrer
      await User.findByIdAndUpdate(
        referrerId,
        {
          $inc: {
            coins: REFERRAL_REWARD,
            referralCount: 1,
          },
          $push: {
            referralHistory: {
              referredUser: newUserId,
              referredUserName: newUser.name,
              referredUserEmail: newUser.email,
              coinsEarned: REFERRAL_REWARD,
              referredAt: new Date(),
            },
          },
        },
        { session, new: true }
      );

      console.log(
        `✅ Referral reward processed: ${REFERRAL_REWARD} coins to user ${referrerId}`
      );

      return { success: true, coinsEarned: REFERRAL_REWARD };
    });

    return result;
  } catch (error) {
    console.error("Error processing referral reward:", error);
    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

const getReferralStats = async (userId) => {
  try {
    if (!userId) {
      return { success: false, message: "User ID is required" };
    }

    const user = await User.findById(userId)
      .select("referralCode referralCount coins referralHistory name")
      .populate({
        path: "referralHistory.referredUser",
        select: "name email createdAt isVerified",
      })
      .lean();

    if (!user) {
      return { success: false, message: "User not found" };
    }

    const totalCoinsFromReferrals = user.referralHistory.reduce(
      (sum, ref) => sum + (ref.coinsEarned || 0),
      0
    );

    const recentReferrals = user.referralHistory.filter((ref) => {
      const referralDate = new Date(ref.referredAt);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return referralDate >= thirtyDaysAgo;
    }).length;

    const stats = {
      referralCode: user.referralCode,
      totalReferrals: user.referralCount || 0,
      totalCoins: user.coins || 0,
      totalCoinsFromReferrals,
      recentReferrals,
      referralHistory: user.referralHistory || [],
      referralLink: `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/register?ref=${user.referralCode}`,
      userName: user.name,
      averageCoinsPerReferral:
        user.referralCount > 0
          ? (totalCoinsFromReferrals / user.referralCount).toFixed(2)
          : 0,
    };

    return { success: true, stats };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return { success: false, error: error.message };
  }
};

const canUserRefer = async (userId) => {
  try {
    if (!userId) {
      return false;
    }

    const user = await User.findById(userId).select("isVerified isActive");
    return user && user.isVerified && user.isActive;
  } catch (error) {
    console.error("Error checking user referral eligibility:", error);
    return false;
  }
};

const getReferralLeaderboard = async (limit = 10, page = 1) => {
  try {
    const skip = (page - 1) * limit;

    const topReferrers = await User.find({
      isVerified: true,
      isActive: true,
      referralCount: { $gt: 0 },
    })
      .select("name referralCode referralCount coins createdAt")
      .sort({ referralCount: -1, coins: -1, createdAt: 1 })
      .skip(skip)
      .limit(Number(limit))
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

    return {
      success: true,
      leaderboard,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / limit),
        totalUsers: totalCount,
        hasMore: skip + topReferrers.length < totalCount,
      },
    };
  } catch (error) {
    console.error("Error getting referral leaderboard:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateReferralCode,
  verifyReferralCode,
  processReferralReward,
  getReferralStats,
  canUserRefer,
  getReferralLeaderboard,
};
