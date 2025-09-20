const crypto = require("crypto");
const User = require("../models/User");

// Constants
const REFERRAL_REWARD_COINS = parseInt(process.env.REFERRAL_REWARD_COINS) || 10;
const MAX_REFERRAL_CODE_ATTEMPTS = 5;
const REFERRAL_CODE_LENGTH = 8;

/**
 * Generate a unique referral code based on user data
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @returns {string} Generated referral code
 */
const generateReferralCode = (name, email) => {
  try {
    // Input validation
    if (!name || typeof name !== "string") {
      throw new Error("Valid name is required for referral code generation");
    }
    if (!email || typeof email !== "string") {
      throw new Error("Valid email is required for referral code generation");
    }

    // Clean and prepare inputs
    const cleanName = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const cleanEmail = email.trim().toLowerCase();

    // Extract components
    const namePrefix =
      cleanName.length >= 2
        ? cleanName.substring(0, 2)
        : cleanName.padEnd(2, "X");

    const emailPrefix = cleanEmail.substring(0, 1).toUpperCase();

    // Generate random component
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(4).toString("hex").toUpperCase();

    // Combine components
    const baseCode = `${namePrefix}${emailPrefix}${randomBytes}${timestamp.slice(
      -2
    )}`;

    // Ensure code is exactly the desired length
    const finalCode = baseCode.substring(0, REFERRAL_CODE_LENGTH);

    // Validate final code
    if (!/^[A-Z0-9]+$/.test(finalCode)) {
      throw new Error("Generated referral code contains invalid characters");
    }

    return finalCode;
  } catch (error) {
    console.error("Error generating referral code:", error);

    // Fallback to purely random code
    const fallbackCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `REF${fallbackCode}`;
  }
};

/**
 * Generate a unique referral code with database collision check
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @returns {Promise<string>} Unique referral code
 */
const generateUniqueReferralCode = async (name, email) => {
  let attempts = 0;
  let isUnique = false;
  let referralCode;

  while (!isUnique && attempts < MAX_REFERRAL_CODE_ATTEMPTS) {
    referralCode = generateReferralCode(name, email);

    try {
      const existingCode = await User.findOne({
        referralCode: referralCode.toUpperCase(),
      });

      if (!existingCode) {
        isUnique = true;
      } else {
        attempts++;
        console.log(
          `Referral code collision detected: ${referralCode} (attempt ${attempts})`
        );
      }
    } catch (error) {
      console.error("Error checking referral code uniqueness:", error);
      attempts++;
    }
  }

  if (!isUnique) {
    throw new Error(
      `Unable to generate unique referral code after ${MAX_REFERRAL_CODE_ATTEMPTS} attempts`
    );
  }

  return referralCode;
};

/**
 * Verify if a referral code is valid and active
 * @param {string} referralCode - The referral code to verify
 * @returns {Promise<Object>} Verification result
 */
const verifyReferralCode = async (referralCode) => {
  try {
    // Input validation
    if (!referralCode || typeof referralCode !== "string") {
      return { valid: false, message: "Referral code is required" };
    }

    const cleanCode = referralCode.trim().toUpperCase();

    // Format validation
    if (cleanCode.length < 3 || cleanCode.length > 20) {
      return { valid: false, message: "Invalid referral code format" };
    }

    if (!/^[A-Z0-9]+$/.test(cleanCode)) {
      return {
        valid: false,
        message: "Referral code contains invalid characters",
      };
    }

    // Database lookup
    const referrer = await User.findOne({
      referralCode: cleanCode,
      isVerified: true,
      isActive: true,
      deletedAt: null,
    }).select("_id name referralCode email createdAt referralCount");

    if (!referrer) {
      return {
        valid: false,
        message: "Invalid referral code or referrer account not active",
      };
    }

    return {
      valid: true,
      referrer,
      message: "Valid referral code",
    };
  } catch (error) {
    console.error("Error verifying referral code:", error);
    return {
      valid: false,
      message: "Error verifying referral code",
      error: error.message,
    };
  }
};

/**
 * Process referral reward for successful referral
 * @param {string} referrerId - ID of the user who referred
 * @param {string} newUserId - ID of the newly registered user
 * @param {Object} session - MongoDB session for transactions (optional)
 * @returns {Promise<Object>} Processing result
 */
const processReferralReward = async (referrerId, newUserId, session = null) => {
  const useSession = session || (await User.db.startSession());
  const shouldEndSession = !session;

  try {
    let result;

    const transactionCallback = async () => {
      // Fetch both users within transaction
      const [referrer, newUser] = await Promise.all([
        User.findById(referrerId).session(useSession),
        User.findById(newUserId).session(useSession),
      ]);

      if (!referrer) {
        throw new Error("Referrer not found");
      }

      if (!newUser) {
        throw new Error("New user not found");
      }

      // Validation checks
      if (!newUser.isVerified) {
        throw new Error(
          "New user must be verified before processing referral reward"
        );
      }

      if (!referrer.isActive || !referrer.isVerified) {
        throw new Error("Referrer account must be active and verified");
      }

      // Check if reward already processed
      const existingReferral = referrer.referralHistory.find(
        (ref) => ref.referredUser.toString() === newUserId.toString()
      );

      if (existingReferral && existingReferral.status === "verified") {
        throw new Error("Referral reward already processed for this user");
      }

      // Calculate reward (could be dynamic based on referrer level)
      const rewardAmount = calculateReferralReward(referrer);

      // Add referral to history
      const referralEntry = referrer.addReferral(newUser, rewardAmount);

      // Update referral status to verified
      referralEntry.status = "verified";

      // Save referrer with updated data
      await referrer.save({ session: useSession });

      // Update new user's referral source confirmation
      newUser.referredBy = referrerId;
      await newUser.save({ session: useSession });

      console.log(`✅ Referral reward processed successfully:`, {
        referrerId,
        newUserId,
        coinsEarned: rewardAmount,
        referrerTotalReferrals: referrer.referralCount,
        referrerTotalCoins: referrer.coins,
      });

      return { success: true, coinsEarned: rewardAmount, referralEntry };
    };

    if (session) {
      result = await transactionCallback();
    } else {
      result = await useSession.withTransaction(transactionCallback);
    }

    return result;
  } catch (error) {
    console.error("Error processing referral reward:", error);
    return {
      success: false,
      error: error.message,
      details: {
        referrerId,
        newUserId,
        timestamp: new Date().toISOString(),
      },
    };
  } finally {
    if (shouldEndSession) {
      await useSession.endSession();
    }
  }
};

/**
 * Calculate referral reward based on referrer's level/performance
 * @param {Object} referrer - The referrer user object
 * @returns {number} Calculated reward amount
 */
const calculateReferralReward = (referrer) => {
  const baseReward = REFERRAL_REWARD_COINS;
  const referralCount = referrer.referralCount || 0;

  // Tier-based bonus system
  let bonus = 0;
  if (referralCount >= 100) {
    bonus = Math.floor(baseReward * 0.5); // 50% bonus for 100+ referrals
  } else if (referralCount >= 50) {
    bonus = Math.floor(baseReward * 0.3); // 30% bonus for 50+ referrals
  } else if (referralCount >= 25) {
    bonus = Math.floor(baseReward * 0.2); // 20% bonus for 25+ referrals
  } else if (referralCount >= 10) {
    bonus = Math.floor(baseReward * 0.1); // 10% bonus for 10+ referrals
  }

  return baseReward + bonus;
};

/**
 * Get comprehensive referral statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Referral statistics
 */
const getReferralStats = async (userId) => {
  try {
    if (!userId) {
      return { success: false, message: "User ID is required" };
    }

    const user = await User.findById(userId)
      .select(
        "name referralCode referralCount coins totalEarned successfulReferrals referralHistory createdAt"
      )
      .populate({
        path: "referralHistory.referredUser",
        select: "name email createdAt isVerified isActive",
      })
      .lean();

    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Calculate advanced statistics
    const referralHistory = user.referralHistory || [];
    const totalCoinsFromReferrals = referralHistory.reduce(
      (sum, ref) => sum + (ref.coinsEarned || 0),
      0
    );

    // Time-based analysis
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentReferrals = referralHistory.filter(
      (ref) => new Date(ref.referredAt) >= thirtyDaysAgo
    ).length;

    const weeklyReferrals = referralHistory.filter(
      (ref) => new Date(ref.referredAt) >= sevenDaysAgo
    ).length;

    // Status analysis
    const verifiedReferrals = referralHistory.filter(
      (ref) => ref.status === "verified"
    ).length;

    const pendingReferrals = referralHistory.filter(
      (ref) => ref.status === "pending"
    ).length;

    // Performance metrics
    const conversionRate =
      user.referralCount > 0
        ? ((verifiedReferrals / user.referralCount) * 100).toFixed(2)
        : 0;

    const averageCoinsPerReferral =
      user.referralCount > 0
        ? (totalCoinsFromReferrals / user.referralCount).toFixed(2)
        : 0;

    // Monthly breakdown for charts
    const monthlyBreakdown = getMonthlyReferralBreakdown(referralHistory);

    // Calculate user's rank
    const rank =
      (await User.countDocuments({
        referralCount: { $gt: user.referralCount },
        isVerified: true,
        isActive: true,
        deletedAt: null,
      })) + 1;

    // Next milestone calculation
    const milestones = [5, 10, 25, 50, 100, 250, 500, 1000];
    const currentMilestone = milestones
      .filter((m) => m <= user.referralCount)
      .pop();
    const nextMilestone = milestones.find((m) => m > user.referralCount);

    const stats = {
      // Basic info
      user: {
        name: user.name,
        referralCode: user.referralCode,
        memberSince: user.createdAt,
        currentRank: rank,
      },

      // Core metrics
      totals: {
        referralCount: user.referralCount || 0,
        successfulReferrals: verifiedReferrals,
        pendingReferrals,
        totalCoins: user.coins || 0,
        totalEarned: user.totalEarned || 0,
        coinsFromReferrals: totalCoinsFromReferrals,
      },

      // Performance metrics
      performance: {
        conversionRate: `${conversionRate}%`,
        averageCoinsPerReferral,
        weeklyReferrals,
        monthlyReferrals: recentReferrals,
        bestMonth: getBestMonth(referralHistory),
      },

      // Progress and milestones
      progress: {
        currentMilestone,
        nextMilestone: nextMilestone
          ? {
              target: nextMilestone,
              remaining: nextMilestone - (user.referralCount || 0),
              progress: (
                ((user.referralCount || 0) / nextMilestone) *
                100
              ).toFixed(1),
            }
          : null,
        rank,
        percentile: await calculatePercentile(user.referralCount || 0),
      },

      // Referral link and sharing
      sharing: {
        referralLink: `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/register?ref=${user.referralCode}`,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
          `${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/register?ref=${user.referralCode}`
        )}`,
        shareMessage: `Join me on AdsMoney and start earning! Use my referral code: ${user.referralCode}`,
      },

      // Historical data for charts
      history: {
        monthly: monthlyBreakdown,
        referralHistory: referralHistory.slice(0, 10), // Recent 10 referrals
      },

      // Achievements and badges
      achievements: calculateAchievements(
        user.referralCount || 0,
        verifiedReferrals,
        conversionRate
      ),
    };

    return { success: true, stats };
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to retrieve referral statistics",
    };
  }
};

/**
 * Calculate monthly referral breakdown for charts
 * @param {Array} referralHistory - Array of referral records
 * @returns {Array} Monthly breakdown data
 */
const getMonthlyReferralBreakdown = (referralHistory) => {
  const monthlyData = {};

  // Initialize last 12 months
  for (let i = 11; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    monthlyData[key] = { month: key, referrals: 0, coins: 0 };
  }

  // Populate with actual data
  referralHistory.forEach((ref) => {
    const date = new Date(ref.referredAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;

    if (monthlyData[key]) {
      monthlyData[key].referrals += 1;
      monthlyData[key].coins += ref.coinsEarned || 0;
    }
  });

  return Object.values(monthlyData);
};

/**
 * Find the best performing month
 * @param {Array} referralHistory - Array of referral records
 * @returns {Object|null} Best month data
 */
const getBestMonth = (referralHistory) => {
  const monthlyBreakdown = getMonthlyReferralBreakdown(referralHistory);
  return monthlyBreakdown.reduce(
    (best, current) => (current.referrals > best.referrals ? current : best),
    { month: null, referrals: 0, coins: 0 }
  );
};

/**
 * Calculate user's percentile rank
 * @param {number} userReferralCount - User's referral count
 * @returns {Promise<number>} Percentile rank
 */
const calculatePercentile = async (userReferralCount) => {
  try {
    const totalUsers = await User.countDocuments({
      isVerified: true,
      isActive: true,
      deletedAt: null,
    });

    const usersWithLessReferrals = await User.countDocuments({
      referralCount: { $lt: userReferralCount },
      isVerified: true,
      isActive: true,
      deletedAt: null,
    });

    return totalUsers > 0
      ? Math.round((usersWithLessReferrals / totalUsers) * 100)
      : 0;
  } catch (error) {
    console.error("Error calculating percentile:", error);
    return 0;
  }
};

/**
 * Calculate achievements and badges
 * @param {number} totalReferrals - Total referral count
 * @param {number} verifiedReferrals - Verified referral count
 * @param {number} conversionRate - Conversion rate percentage
 * @returns {Object} Achievements data
 */
const calculateAchievements = (
  totalReferrals,
  verifiedReferrals,
  conversionRate
) => {
  const achievements = {
    badges: [],
    milestones: [],
    specialAchievements: [],
  };

  // Referral count badges
  const referralBadges = [
    {
      count: 1,
      name: "First Blood",
      icon: "🎯",
      description: "Made your first referral",
    },
    {
      count: 5,
      name: "Getting Started",
      icon: "🌱",
      description: "Reached 5 referrals",
    },
    {
      count: 10,
      name: "Double Digits",
      icon: "🔟",
      description: "Hit 10 referrals",
    },
    {
      count: 25,
      name: "Quarter Century",
      icon: "🎖️",
      description: "Achieved 25 referrals",
    },
    {
      count: 50,
      name: "Half Century",
      icon: "🏅",
      description: "Reached 50 referrals",
    },
    {
      count: 100,
      name: "Centurion",
      icon: "💯",
      description: "Hit the 100 mark",
    },
    {
      count: 250,
      name: "Champion",
      icon: "🏆",
      description: "Elite referrer status",
    },
    {
      count: 500,
      name: "Legend",
      icon: "👑",
      description: "Legendary performance",
    },
    { count: 1000, name: "Master", icon: "🌟", description: "Referral master" },
  ];

  achievements.badges = referralBadges.filter(
    (badge) => totalReferrals >= badge.count
  );

  // Conversion rate achievements
  if (totalReferrals >= 5) {
    const rate = parseFloat(conversionRate);
    if (rate >= 90) {
      achievements.specialAchievements.push({
        name: "Conversion Master",
        icon: "💎",
        description: "90%+ conversion rate with 5+ referrals",
      });
    } else if (rate >= 75) {
      achievements.specialAchievements.push({
        name: "Quality Referrer",
        icon: "⭐",
        description: "75%+ conversion rate",
      });
    }
  }

  // Special achievements
  if (verifiedReferrals >= 10) {
    achievements.specialAchievements.push({
      name: "Community Builder",
      icon: "🏗️",
      description: "Helped 10+ people join successfully",
    });
  }

  if (totalReferrals >= 50 && parseFloat(conversionRate) >= 80) {
    achievements.specialAchievements.push({
      name: "Elite Recruiter",
      icon: "🎖️",
      description: "50+ referrals with 80%+ conversion",
    });
  }

  return achievements;
};

/**
 * Check if user can make referrals
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} Whether user can refer
 */
const canUserRefer = async (userId) => {
  try {
    const user = await User.findById(userId).select(
      "isVerified isActive accountLockUntil deletedAt"
    );

    if (!user) return false;

    return (
      user.isVerified &&
      user.isActive &&
      !user.deletedAt &&
      (!user.accountLockUntil || user.accountLockUntil < new Date())
    );
  } catch (error) {
    console.error("Error checking user referral eligibility:", error);
    return false;
  }
};

/**
 * Get referral leaderboard with advanced metrics
 * @param {number} limit - Number of top users to return
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Leaderboard data
 */
const getReferralLeaderboard = async (limit = 20, options = {}) => {
  try {
    const { includeStats = false, period = null } = options;

    let matchStage = {
      isVerified: true,
      isActive: true,
      referralCount: { $gt: 0 },
      deletedAt: null,
    };

    // Add time period filter if specified
    if (period) {
      const periodStart = new Date();
      switch (period) {
        case "week":
          periodStart.setDate(periodStart.getDate() - 7);
          break;
        case "month":
          periodStart.setMonth(periodStart.getMonth() - 1);
          break;
        case "year":
          periodStart.setFullYear(periodStart.getFullYear() - 1);
          break;
      }

      matchStage["referralHistory.referredAt"] = { $gte: periodStart };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          conversionRate: {
            $cond: {
              if: { $gt: ["$referralCount", 0] },
              then: {
                $multiply: [
                  { $divide: ["$successfulReferrals", "$referralCount"] },
                  100,
                ],
              },
              else: 0,
            },
          },
        },
      },
      {
        $sort: {
          referralCount: -1,
          coins: -1,
          createdAt: 1,
        },
      },
      { $limit: limit },
      {
        $project: {
          name: 1,
          referralCode: 1,
          referralCount: 1,
          successfulReferrals: 1,
          coins: 1,
          totalEarned: 1,
          createdAt: 1,
          conversionRate: { $round: ["$conversionRate", 1] },
        },
      },
    ];

    const leaderboard = await User.aggregate(pipeline);

    // Add rank and additional stats
    return leaderboard.map((user, index) => ({
      rank: index + 1,
      name: user.name,
      referralCode: user.referralCode,
      totalReferrals: user.referralCount,
      successfulReferrals: user.successfulReferrals || 0,
      conversionRate: `${user.conversionRate}%`,
      totalCoins: user.coins,
      totalEarned: user.totalEarned || user.coins,
      memberSince: user.createdAt,
      badge: getBadgeForRank(index + 1, user.referralCount),
      ...(includeStats && {
        avgCoinsPerReferral:
          user.referralCount > 0
            ? Math.round(user.coins / user.referralCount)
            : 0,
        membershipDays: Math.floor(
          (Date.now() - new Date(user.createdAt).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      }),
    }));
  } catch (error) {
    console.error("Error getting referral leaderboard:", error);
    return [];
  }
};

/**
 * Get badge for leaderboard rank
 * @param {number} rank - User's rank
 * @param {number} referralCount - User's referral count
 * @returns {Object|null} Badge object
 */
const getBadgeForRank = (rank, referralCount) => {
  if (rank === 1) return { icon: "🥇", name: "Gold Medal", color: "#FFD700" };
  if (rank === 2) return { icon: "🥈", name: "Silver Medal", color: "#C0C0C0" };
  if (rank === 3) return { icon: "🥉", name: "Bronze Medal", color: "#CD7F32" };
  if (rank <= 10) return { icon: "🏆", name: "Top 10", color: "#4F46E5" };
  if (referralCount >= 50)
    return { icon: "⭐", name: "Star Performer", color: "#059669" };
  return null;
};

/**
 * Bulk process referral rewards (for admin use)
 * @param {Array} referralPairs - Array of {referrerId, newUserId} objects
 * @returns {Promise<Object>} Bulk processing results
 */
const bulkProcessReferralRewards = async (referralPairs) => {
  const session = await User.db.startSession();
  const results = {
    successful: [],
    failed: [],
    totalProcessed: 0,
    totalCoinsAwarded: 0,
  };

  try {
    await session.withTransaction(async () => {
      for (const pair of referralPairs) {
        try {
          const result = await processReferralReward(
            pair.referrerId,
            pair.newUserId,
            session
          );

          if (result.success) {
            results.successful.push({
              ...pair,
              coinsAwarded: result.coinsEarned,
            });
            results.totalCoinsAwarded += result.coinsEarned;
          } else {
            results.failed.push({
              ...pair,
              error: result.error,
            });
          }

          results.totalProcessed++;
        } catch (error) {
          results.failed.push({
            ...pair,
            error: error.message,
          });
          results.totalProcessed++;
        }
      }
    });

    console.log(`✅ Bulk referral processing completed:`, {
      totalProcessed: results.totalProcessed,
      successful: results.successful.length,
      failed: results.failed.length,
      totalCoinsAwarded: results.totalCoinsAwarded,
    });

    return results;
  } catch (error) {
    console.error("Error in bulk referral processing:", error);
    return {
      ...results,
      error: error.message,
    };
  } finally {
    await session.endSession();
  }
};

module.exports = {
  generateReferralCode,
  generateUniqueReferralCode,
  verifyReferralCode,
  processReferralReward,
  getReferralStats,
  canUserRefer,
  getReferralLeaderboard,
  calculateReferralReward,
  bulkProcessReferralRewards,

  // Helper functions (exported for testing)
  getMonthlyReferralBreakdown,
  calculateAchievements,
  getBadgeForRank,

  // Constants
  REFERRAL_REWARD_COINS,
  MAX_REFERRAL_CODE_ATTEMPTS,
  REFERRAL_CODE_LENGTH,
};
