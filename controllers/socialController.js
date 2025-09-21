const User = require("../models/User");
const Follow = require("../models/Follow");
const Image = require("../models/Image");

// Follow a user
const followUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;

    // Validation
    if (userId === followerId) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself",
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: userId,
      deletedAt: null,
    });

    if (existingFollow) {
      if (existingFollow.status === "active") {
        return res.status(400).json({
          success: false,
          message: "You are already following this user",
        });
      } else {
        // Reactivate follow
        await existingFollow.refollow();

        res.json({
          success: true,
          message: `You are now following ${targetUser.name}`,
          data: {
            action: "refollowed",
            following: {
              id: targetUser._id,
              name: targetUser.name,
              email: targetUser.email,
            },
            followedAt: existingFollow.followedAt,
          },
        });
        return;
      }
    }

    // Create new follow relationship
    const newFollow = new Follow({
      follower: followerId,
      followerName: req.user.name,
      followerEmail: req.user.email,
      following: userId,
      followingName: targetUser.name,
      followingEmail: targetUser.email,
      followSource: req.body.source || "profile",
    });

    await newFollow.save();

    res.status(201).json({
      success: true,
      message: `You are now following ${targetUser.name}`,
      data: {
        action: "followed",
        following: {
          id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email,
        },
        followedAt: newFollow.followedAt,
        followId: newFollow._id,
      },
    });
  } catch (error) {
    console.error("Follow user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to follow user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Unfollow a user
const unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;

    const follow = await Follow.findOne({
      follower: followerId,
      following: userId,
      status: "active",
      deletedAt: null,
    });

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: "You are not following this user",
      });
    }

    await follow.unfollow();

    res.json({
      success: true,
      message: `You have unfollowed ${follow.followingName}`,
      data: {
        action: "unfollowed",
        unfollowedUser: {
          id: userId,
          name: follow.followingName,
        },
        unfollowedAt: follow.unfollowedAt,
      },
    });
  } catch (error) {
    console.error("Unfollow user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unfollow user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get user's followers
const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, search } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {
      following: userId,
      status: "active",
      deletedAt: null,
    };

    if (search) {
      query.$or = [
        { followerName: { $regex: search, $options: "i" } },
        { followerEmail: { $regex: search, $options: "i" } },
      ];
    }

    const [followers, totalCount] = await Promise.all([
      Follow.find(query)
        .populate(
          "follower",
          "name email referralCode avatar stats.lastActivity"
        )
        .sort({ followedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Follow.countDocuments(query),
    ]);

    // Add mutual follow status if requesting user is authenticated
    let followersWithMutual = followers;
    if (req.user && req.user.id !== userId) {
      followersWithMutual = await Promise.all(
        followers.map(async (follow) => {
          const isMutual = await Follow.isFollowing(
            req.user.id,
            follow.follower._id
          );
          return {
            ...follow,
            isMutualFollow: isMutual,
          };
        })
      );
    }

    res.json({
      success: true,
      message: "Followers retrieved successfully",
      data: {
        followers: followersWithMutual,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalFollowers: totalCount,
          hasMore: skip + followers.length < totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Get followers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve followers",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get user's following list
const getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, search } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {
      follower: userId,
      status: "active",
      deletedAt: null,
    };

    if (search) {
      query.$or = [
        { followingName: { $regex: search, $options: "i" } },
        { followingEmail: { $regex: search, $options: "i" } },
      ];
    }

    const [following, totalCount] = await Promise.all([
      Follow.find(query)
        .populate(
          "following",
          "name email referralCode avatar stats.lastActivity"
        )
        .sort({ followedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Follow.countDocuments(query),
    ]);

    // Add mutual follow status
    const followingWithMutual = await Promise.all(
      following.map(async (follow) => {
        const isMutual = await Follow.isFollowing(follow.following._id, userId);
        return {
          ...follow,
          isMutualFollow: isMutual,
        };
      })
    );

    res.json({
      success: true,
      message: "Following list retrieved successfully",
      data: {
        following: followingWithMutual,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalFollowing: totalCount,
          hasMore: skip + following.length < totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve following list",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get follow suggestions
const getFollowSuggestions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;

    const suggestions = await Follow.getSuggestedFollows(
      userId,
      parseInt(limit)
    );

    // Filter out users already followed
    const currentFollowing = await Follow.find({
      follower: userId,
      status: "active",
      deletedAt: null,
    }).select("following");

    const followingIds = currentFollowing.map((f) => f.following.toString());

    const filteredSuggestions = suggestions.filter(
      (suggestion) => !followingIds.includes(suggestion._id.toString())
    );

    res.json({
      success: true,
      message: "Follow suggestions retrieved successfully",
      data: {
        suggestions: filteredSuggestions.map((suggestion) => ({
          user: suggestion.user,
          mutualFollows: suggestion.mutualCount,
          mutualConnections: suggestion.mutualConnections,
          reason: `${suggestion.mutualCount} mutual connection${
            suggestion.mutualCount > 1 ? "s" : ""
          }`,
        })),
      },
    });
  } catch (error) {
    console.error("Get follow suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve follow suggestions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get social feed (posts from followed users)
const getSocialFeed = async (req, res) => {
  try {
    const { page = 1, limit = 20, timeframe = "week" } = req.query;
    const userId = req.user.id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users that current user follows
    const following = await Follow.find({
      follower: userId,
      status: "active",
      deletedAt: null,
    }).select("following");

    const followingIds = following.map((f) => f.following);
    followingIds.push(userId); // Include user's own posts

    // Time filter
    let timeFilter = {};
    const now = new Date();
    switch (timeframe) {
      case "day":
        timeFilter.createdAt = {
          $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        };
        break;
      case "week":
        timeFilter.createdAt = {
          $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        };
        break;
      case "month":
        timeFilter.createdAt = {
          $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        };
        break;
      default:
        // All time
        break;
    }

    const [posts, totalCount] = await Promise.all([
      Image.find({
        createdBy: { $in: followingIds },
        isPublic: true,
        deletedAt: null,
        moderationStatus: "approved",
        ...timeFilter,
      })
        .populate("createdBy", "name email referralCode avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Image.countDocuments({
        createdBy: { $in: followingIds },
        isPublic: true,
        deletedAt: null,
        moderationStatus: "approved",
        ...timeFilter,
      }),
    ]);

    // Add user interaction data
    const postsWithUserData = await Promise.all(
      posts.map(async (post) => {
        const isLiked = post.likes.some(
          (like) => like.user.toString() === userId
        );
        const isFollowing = await Follow.isFollowing(
          userId,
          post.createdBy._id
        );

        return {
          ...post,
          isLikedByUser: isLiked,
          isFollowingCreator:
            isFollowing || post.createdBy._id.toString() === userId,
          // Remove sensitive data
          likes: undefined,
          viewedBy: undefined,
        };
      })
    );

    res.json({
      success: true,
      message: "Social feed retrieved successfully",
      data: {
        posts: postsWithUserData,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalPosts: totalCount,
          hasMore: skip + posts.length < totalCount,
        },
        filters: {
          timeframe,
          followingCount: followingIds.length - 1, // Exclude self
        },
      },
    });
  } catch (error) {
    console.error("Get social feed error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve social feed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get user profile with social stats
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user ? req.user.id : null;

    const user = await User.findById(userId)
      .select(
        "-password -otp -otpExpiry -emailVerificationToken -passwordResetToken"
      )
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get social stats
    const [followStats, imageStats, recentImages] = await Promise.all([
      Follow.getFollowStats(userId),
      Image.aggregate([
        {
          $match: {
            createdBy: user._id,
            isPublic: true,
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: null,
            totalImages: { $sum: 1 },
            totalLikes: { $sum: "$likeCount" },
            totalComments: { $sum: "$commentCount" },
            totalViews: { $sum: "$views" },
          },
        },
      ]),
      Image.find({
        createdBy: userId,
        isPublic: true,
        deletedAt: null,
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("url thumbnailUrl likeCount commentCount createdAt")
        .lean(),
    ]);

    const socialStats = imageStats[0] || {
      totalImages: 0,
      totalLikes: 0,
      totalComments: 0,
      totalViews: 0,
    };

    // Check relationship with current user
    let isFollowing = false;
    let isFollowedBy = false;
    let isMutual = false;

    if (currentUserId && currentUserId !== userId) {
      [isFollowing, isFollowedBy] = await Promise.all([
        Follow.isFollowing(currentUserId, userId),
        Follow.isFollowing(userId, currentUserId),
      ]);
      isMutual = isFollowing && isFollowedBy;
    }

    const profile = {
      ...user,
      socialStats: {
        followers: followStats.followers,
        following: followStats.following,
        images: socialStats.totalImages,
        totalLikes: socialStats.totalLikes,
        totalComments: socialStats.totalComments,
        totalViews: socialStats.totalViews,
        engagementRate:
          socialStats.totalViews > 0
            ? (
                ((socialStats.totalLikes + socialStats.totalComments) /
                  socialStats.totalViews) *
                100
              ).toFixed(2)
            : 0,
      },
      recentImages,
      relationship: currentUserId
        ? {
            isFollowing,
            isFollowedBy,
            isMutual,
            isSelf: currentUserId === userId,
          }
        : null,
    };

    res.json({
      success: true,
      message: "User profile retrieved successfully",
      data: {
        user: profile,
      },
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Search users
const searchUsers = async (req, res) => {
  try {
    const { q: query, page = 1, limit = 20 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { referralCode: { $regex: query, $options: "i" } },
      ],
      isActive: true,
      isVerified: true,
      deletedAt: null,
    };

    const [users, totalCount] = await Promise.all([
      User.find(searchQuery)
        .select("name email referralCode avatar createdAt stats")
        .sort({ "stats.followerCount": -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(searchQuery),
    ]);

    // Add follow status for authenticated user
    let usersWithFollowStatus = users;
    if (req.user) {
      usersWithFollowStatus = await Promise.all(
        users.map(async (user) => {
          const isFollowing = await Follow.isFollowing(req.user.id, user._id);
          return {
            ...user,
            isFollowing,
          };
        })
      );
    }

    res.json({
      success: true,
      message: "User search completed successfully",
      data: {
        users: usersWithFollowStatus,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalUsers: totalCount,
          hasMore: skip + users.length < totalCount,
        },
        query: query.trim(),
      },
    });
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search users",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowSuggestions,
  getSocialFeed,
  getUserProfile,
  searchUsers,
};
