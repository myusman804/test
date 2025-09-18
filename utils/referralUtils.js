const crypto = require("crypto");
const User = require("../models/User");

// Generate unique referral code
const generateReferralCode = (name, email) => {
  // Combine user info with random string for uniqueness
  const timestamp = Date.now().toString();
  const randomStr = crypto.randomBytes(4).toString("hex").toUpperCase();
  const namePrefix = name.substring(0, 3).toUpperCase();

  return `${namePrefix}${randomStr}${timestamp.slice(-4)}`;
};

// Verify referral code exists and is valid
const verifyReferralCode = async (referralCode) => {
  try {
    if (!referralCode)
      return { valid: false, message: "No referral code provided" };

    const referrer = await User.findOne({
      referralCode: referralCode.toUpperCase(),
      isVerified: true, // Only verified users can refer
    });

    if (!referrer) {
      return { valid: false, message: "Invalid referral code" };
    }

    return { valid: true, referrer, message: "Valid referral code" };
  } catch (error) {
    console.error("Error verifying referral code:", error);
    return { valid: false, message: "Error verifying referral code" };
  }
};

// Process referral reward
const processReferralReward = async (referrerId, newUserId) => {
  try {
    const session = await User.db.startSession();
    session.startTransaction();

    try {
      // Get both users
      const referrer = await User.findById(referrerId).session(session);
      const newUser = await User.findById(newUserId).session(session);

      if (!referrer || !newUser) {
        throw new Error("User not found");
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
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      return { success: true, coinsEarned: REFERRAL_REWARD };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Error processing referral reward:", error);
    return { success: false, error: error.message };
  }
};

// Get referral statistics
const getReferralStats = async (userId) => {
  try {
    const user = await User.findById(userId)
      .populate("referralHistory.referredUser", "name email createdAt")
      .lean();

    if (!user) {
      return { success: false, message: "User not found" };
    }

    const stats = {
      referralCode: user.referralCode,
      totalReferrals: user.referralCount || 0,
      totalCoinsEarned: user.coins || 0,
      referralHistory: user.referralHistory || [],
      referralLink: `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/register?ref=${user.referralCode}`,
    };

    return { success: true, stats };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateReferralCode,
  verifyReferralCode,
  processReferralReward,
  getReferralStats,
};
