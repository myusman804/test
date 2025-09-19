const crypto = require("crypto");
const User = require("../models/User");

const generateReferralCode = (name, email) => {
  try {
    const timestamp = Date.now().toString();
    const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
    const namePrefix = name
      .substring(0, 2)
      .toUpperCase()
      .replace(/[^A-Z]/g, "X");
    const emailPrefix = email.substring(0, 1).toUpperCase();

    return `${namePrefix}${emailPrefix}${randomStr}${timestamp.slice(-3)}`;
  } catch (error) {
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

    return { valid: true, referrer, message: "Valid referral code" };
  } catch (error) {
    console.error("Error verifying referral code:", error);
    return { valid: false, message: "Error verifying referral code" };
  }
};

const processReferralReward = async (referrerId, newUserId) => {
  const session = await User.db.startSession();

  try {
    await session.withTransaction(async () => {
      // Get both users within transaction
      const referrer = await User.findById(referrerId).session(session);
      const newUser = await User.findById(newUserId).session(session);

      if (!referrer || !newUser) {
        throw new Error("User not found during referral processing");
      }

      if (!newUser.isVerified) {
        throw new Error(
          "New user must be verified before processing referral reward"
        );
      }

      const REFERRAL_REWARD = 10;

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
    });

    return { success: true, coinsEarned: 10 };
  } catch (error) {
    console.error("Error processing referral reward:", error);
    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

const getReferralStats = async (userId) => {
  try {
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
    };

    return { success: true, stats };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return { success: false, error: error.message };
  }
};

const canUserRefer = async (userId) => {
  try {
    const user = await User.findById(userId).select("isVerified isActive");
    return user && user.isVerified && user.isActive;
  } catch (error) {
    console.error("Error checking user referral eligibility:", error);
    return false;
  }
};

module.exports = {
  generateReferralCode,
  verifyReferralCode,
  processReferralReward,
  getReferralStats,
  canUserRefer,
};
