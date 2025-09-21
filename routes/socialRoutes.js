const express = require("express");
const {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowSuggestions,
  getSocialFeed,
  getUserProfile,
  searchUsers,
} = require("../controllers/socialController");
const authMiddleware = require("../middleware/authMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const {
  generalLimiter,
  searchLimiter,
  adminLimiter,
} = require("../middleware/rateLimiter");
const {
  sanitizeInput,
  validatePagination,
} = require("../middleware/validation");

const router = express.Router();

console.log("👥 Setting up social routes...");

// Apply sanitization to all routes
router.use(sanitizeInput);

// ===== PUBLIC/OPTIONAL AUTH ROUTES =====

// Get user profile (public but enhanced with auth)
router.get(
  "/users/:userId/profile",
  optionalAuth,
  generalLimiter,
  getUserProfile
);
console.log("✅ GET /users/:userId/profile route registered");

// Search users
router.get(
  "/users/search",
  optionalAuth,
  searchLimiter,
  validatePagination,
  searchUsers
);
console.log("✅ GET /users/search route registered");

// Get user's followers (public)
router.get(
  "/users/:userId/followers",
  optionalAuth,
  generalLimiter,
  validatePagination,
  getFollowers
);
console.log("✅ GET /users/:userId/followers route registered");

// Get user's following list (public)
router.get(
  "/users/:userId/following",
  optionalAuth,
  generalLimiter,
  validatePagination,
  getFollowing
);
console.log("✅ GET /users/:userId/following route registered");

// ===== PROTECTED ROUTES (Require Authentication) =====

// Follow a user
router.post("/follow/:userId", authMiddleware, generalLimiter, followUser);
console.log("✅ POST /follow/:userId route registered");

// Unfollow a user
router.delete("/follow/:userId", authMiddleware, generalLimiter, unfollowUser);
console.log("✅ DELETE /follow/:userId route registered");

// Get follow suggestions
router.get(
  "/suggestions/follow",
  authMiddleware,
  generalLimiter,
  getFollowSuggestions
);
console.log("✅ GET /suggestions/follow route registered");

// Get social feed
router.get(
  "/feed",
  authMiddleware,
  generalLimiter,
  validatePagination,
  getSocialFeed
);
console.log("✅ GET /feed route registered");

// Get current user's social stats
router.get("/me/stats", authMiddleware, generalLimiter, async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const socialStats = await user.getSocialStats();

    res.json({
      success: true,
      message: "Social statistics retrieved successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          referralCode: user.referralCode,
        },
        stats: socialStats,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get user social stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve social statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
console.log("✅ GET /me/stats route registered");

// Get my followers
router.get(
  "/me/followers",
  authMiddleware,
  generalLimiter,
  validatePagination,
  (req, res) => {
    req.params.userId = req.user.id;
    getFollowers(req, res);
  }
);
console.log("✅ GET /me/followers route registered");

// Get my following list
router.get(
  "/me/following",
  authMiddleware,
  generalLimiter,
  validatePagination,
  (req, res) => {
    req.params.userId = req.user.id;
    getFollowing(req, res);
  }
);
console.log("✅ GET /me/following route registered");

// Get mutual follows with another user
router.get(
  "/users/:userId/mutual",
  authMiddleware,
  generalLimiter,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 10 } = req.query;

      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "Cannot get mutual follows with yourself",
        });
      }

      const Follow = require("../models/Follow");
      const mutualFollows = await Follow.getMutualFollows(req.user.id, userId);

      res.json({
        success: true,
        message: "Mutual follows retrieved successfully",
        data: {
          mutualFollows: mutualFollows.slice(0, parseInt(limit)),
          totalMutual: mutualFollows.length,
          user1: req.user.id,
          user2: userId,
        },
      });
    } catch (error) {
      console.error("Get mutual follows error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve mutual follows",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /users/:userId/mutual route registered");

// Check follow status with another user
router.get(
  "/users/:userId/follow-status",
  authMiddleware,
  generalLimiter,
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (userId === req.user.id) {
        return res.json({
          success: true,
          message: "Follow status retrieved",
          data: {
            isFollowing: false,
            isFollowedBy: false,
            isMutual: false,
            isSelf: true,
          },
        });
      }

      const Follow = require("../models/Follow");
      const [isFollowing, isFollowedBy] = await Promise.all([
        Follow.isFollowing(req.user.id, userId),
        Follow.isFollowing(userId, req.user.id),
      ]);

      res.json({
        success: true,
        message: "Follow status retrieved successfully",
        data: {
          isFollowing,
          isFollowedBy,
          isMutual: isFollowing && isFollowedBy,
          isSelf: false,
        },
      });
    } catch (error) {
      console.error("Get follow status error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve follow status",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /users/:userId/follow-status route registered");

// Get recent activity
router.get("/me/activity", authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const Follow = require("../models/Follow");

    const recentFollowers = await Follow.getRecentFollowers(req.user.id, 7);
    const activeFollowers = await Follow.getActiveFollowers(
      req.user.id,
      parseInt(limit)
    );

    res.json({
      success: true,
      message: "Recent activity retrieved successfully",
      data: {
        recentFollowers: recentFollowers.slice(0, parseInt(limit)),
        activeFollowers,
        summary: {
          newFollowersThisWeek: recentFollowers.length,
          totalActiveFollowers: activeFollowers.length,
        },
      },
    });
  } catch (error) {
    console.error("Get recent activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve recent activity",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
console.log("✅ GET /me/activity route registered");

// Update follow notification preferences
router.patch(
  "/follow/:followId/notifications",
  authMiddleware,
  generalLimiter,
  async (req, res) => {
    try {
      const { followId } = req.params;
      const { newPosts = true, comments = false, likes = false } = req.body;

      const Follow = require("../models/Follow");
      const follow = await Follow.findOne({
        _id: followId,
        follower: req.user.id,
        status: "active",
        deletedAt: null,
      });

      if (!follow) {
        return res.status(404).json({
          success: false,
          message: "Follow relationship not found",
        });
      }

      follow.notifications.newPosts = newPosts;
      follow.notifications.comments = comments;
      follow.notifications.likes = likes;
      await follow.save();

      res.json({
        success: true,
        message: "Notification preferences updated successfully",
        data: {
          followId,
          notifications: follow.notifications,
        },
      });
    } catch (error) {
      console.error("Update follow notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update notification preferences",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ PATCH /follow/:followId/notifications route registered");

// ===== ADMIN ROUTES =====

// Get social statistics (Admin only)
router.get(
  "/admin/stats",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const { period = "30" } = req.query;
      const periodDays = parseInt(period);
      const Follow = require("../models/Follow");
      const User = require("../models/User");

      const periodStart = new Date(
        Date.now() - periodDays * 24 * 60 * 60 * 1000
      );

      const [
        totalFollows,
        periodFollows,
        topFollowers,
        followActivity,
        userStats,
      ] = await Promise.all([
        Follow.countDocuments({ status: "active", deletedAt: null }),
        Follow.countDocuments({
          followedAt: { $gte: periodStart },
          status: "active",
          deletedAt: null,
        }),
        Follow.aggregate([
          {
            $match: { status: "active", deletedAt: null },
          },
          {
            $group: {
              _id: "$following",
              followerCount: { $sum: 1 },
              followingName: { $first: "$followingName" },
              followingEmail: { $first: "$followingEmail" },
            },
          },
          { $sort: { followerCount: -1 } },
          { $limit: 10 },
        ]),
        Follow.aggregate([
          {
            $match: {
              followedAt: { $gte: periodStart },
              status: "active",
              deletedAt: null,
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$followedAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: {
                $sum: {
                  $cond: [{ $eq: ["$isActive", true] }, 1, 0],
                },
              },
              verifiedUsers: {
                $sum: {
                  $cond: [{ $eq: ["$isVerified", true] }, 1, 0],
                },
              },
            },
          },
        ]),
      ]);

      const stats = {
        overview: {
          totalFollows,
          periodFollows,
          followRate:
            userStats[0]?.totalUsers > 0
              ? (totalFollows / userStats[0].totalUsers).toFixed(2)
              : 0,
          users: userStats[0] || {
            totalUsers: 0,
            activeUsers: 0,
            verifiedUsers: 0,
          },
        },
        period: {
          days: periodDays,
          dailyActivity: followActivity,
          avgDailyFollows:
            followActivity.length > 0
              ? (
                  followActivity.reduce((sum, day) => sum + day.count, 0) /
                  followActivity.length
                ).toFixed(2)
              : 0,
        },
        topUsers: topFollowers,
        generatedAt: new Date().toISOString(),
        requestedBy: req.user.email,
      };

      res.json({
        success: true,
        message: "Social statistics retrieved successfully",
        data: stats,
      });
    } catch (error) {
      console.error("Admin social stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve social statistics",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /admin/stats route registered");

// Get all follows (Admin only)
router.get(
  "/admin/follows",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        status = "active",
        sortBy = "followedAt",
        sortOrder = "desc",
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const Follow = require("../models/Follow");

      const query = { deletedAt: null };
      if (status) query.status = status;

      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const [follows, totalCount] = await Promise.all([
        Follow.find(query)
          .populate("follower", "name email")
          .populate("following", "name email")
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Follow.countDocuments(query),
      ]);

      res.json({
        success: true,
        message: "All follows retrieved successfully (Admin)",
        data: {
          follows,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalFollows: totalCount,
            hasMore: skip + follows.length < totalCount,
          },
          filters: { status, sortBy, sortOrder },
        },
        adminRequest: {
          requestedBy: req.user.email,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Admin get follows error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve follows",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /admin/follows route registered");

// ===== UTILITY ROUTES =====

// Health check for social service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Social service is healthy",
    timestamp: new Date().toISOString(),
    service: "social",
    features: {
      follow: true,
      feed: true,
      suggestions: true,
      search: true,
      notifications: true,
    },
  });
});
console.log("✅ GET /health route registered");

console.log("🎉 Social routes setup completed successfully!");

module.exports = router;
