const mongoose = require("mongoose");

// Follow/Following relationship schema
const followSchema = new mongoose.Schema(
  {
    // Who is following (the follower)
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Follower is required"],
      index: true,
    },
    followerName: {
      type: String,
      required: true,
      trim: true,
    },
    followerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Who is being followed (the following)
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Following user is required"],
      index: true,
    },
    followingName: {
      type: String,
      required: true,
      trim: true,
    },
    followingEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Follow status and metadata
    status: {
      type: String,
      enum: ["active", "blocked", "muted"],
      default: "active",
      index: true,
    },

    // Notification preferences
    notifications: {
      newPosts: {
        type: Boolean,
        default: true,
      },
      comments: {
        type: Boolean,
        default: false,
      },
      likes: {
        type: Boolean,
        default: false,
      },
    },

    // Interaction tracking
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    interactionCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Follow history
    followedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    unfollowedAt: {
      type: Date,
      default: null,
    },
    refollowCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Additional metadata
    followSource: {
      type: String,
      enum: ["profile", "post", "search", "suggestion", "referral", "other"],
      default: "other",
    },
    mutualFollows: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Compound indexes for better performance
followSchema.index({ follower: 1, following: 1 }, { unique: true }); // Prevent duplicate follows
followSchema.index({ follower: 1, createdAt: -1 }); // User's following list
followSchema.index({ following: 1, createdAt: -1 }); // User's followers list
followSchema.index({ status: 1, createdAt: -1 }); // Active follows
followSchema.index({ followedAt: -1, status: 1 }); // Recent follows
followSchema.index({ deletedAt: 1 }); // Soft delete queries

// Virtual fields
followSchema.virtual("followDuration").get(function () {
  const now = this.unfollowedAt || new Date();
  return Math.floor((now - this.followedAt) / (1000 * 60 * 60 * 24)); // Days
});

followSchema.virtual("isActive").get(function () {
  return this.status === "active" && !this.deletedAt;
});

followSchema.virtual("isMutual").get(function () {
  // This will be populated by controllers when needed
  return false;
});

// Instance methods
followSchema.methods.unfollow = function () {
  this.unfollowedAt = new Date();
  this.deletedAt = new Date();
  return this.save();
};

followSchema.methods.refollow = function () {
  this.unfollowedAt = null;
  this.deletedAt = null;
  this.refollowCount += 1;
  this.followedAt = new Date();
  return this.save();
};

followSchema.methods.mute = function () {
  this.status = "muted";
  this.notifications.newPosts = false;
  this.notifications.comments = false;
  this.notifications.likes = false;
  return this.save();
};

followSchema.methods.unmute = function () {
  this.status = "active";
  this.notifications.newPosts = true;
  return this.save();
};

followSchema.methods.block = function () {
  this.status = "blocked";
  this.notifications.newPosts = false;
  this.notifications.comments = false;
  this.notifications.likes = false;
  return this.save();
};

followSchema.methods.updateInteraction = function () {
  this.lastInteraction = new Date();
  this.interactionCount += 1;
  return this.save();
};

// Static methods
followSchema.statics.findFollowers = function (userId, options = {}) {
  const {
    status = "active",
    limit = 50,
    skip = 0,
    sortBy = "createdAt",
  } = options;

  return this.find({
    following: userId,
    status,
    deletedAt: null,
  })
    .populate("follower", "name email referralCode avatar")
    .sort({ [sortBy]: -1 })
    .skip(skip)
    .limit(limit);
};

followSchema.statics.findFollowing = function (userId, options = {}) {
  const {
    status = "active",
    limit = 50,
    skip = 0,
    sortBy = "createdAt",
  } = options;

  return this.find({
    follower: userId,
    status,
    deletedAt: null,
  })
    .populate("following", "name email referralCode avatar")
    .sort({ [sortBy]: -1 })
    .skip(skip)
    .limit(limit);
};

followSchema.statics.isFollowing = async function (followerId, followingId) {
  const follow = await this.findOne({
    follower: followerId,
    following: followingId,
    status: "active",
    deletedAt: null,
  });

  return !!follow;
};

followSchema.statics.getMutualFollows = async function (userId1, userId2) {
  // Get users that both userId1 and userId2 follow
  const user1Following = await this.find({
    follower: userId1,
    status: "active",
    deletedAt: null,
  }).select("following");

  const user2Following = await this.find({
    follower: userId2,
    status: "active",
    deletedAt: null,
  }).select("following");

  const user1FollowingIds = user1Following.map((f) => f.following.toString());
  const user2FollowingIds = user2Following.map((f) => f.following.toString());

  const mutualIds = user1FollowingIds.filter((id) =>
    user2FollowingIds.includes(id)
  );

  return this.populate(
    mutualIds.map((id) => ({ following: id })),
    { path: "following", select: "name email avatar" }
  );
};

followSchema.statics.getFollowStats = async function (userId) {
  const [followersCount, followingCount, mutualFollowsCount] =
    await Promise.all([
      this.countDocuments({
        following: userId,
        status: "active",
        deletedAt: null,
      }),
      this.countDocuments({
        follower: userId,
        status: "active",
        deletedAt: null,
      }),
      this.countDocuments({
        follower: userId,
        status: "active",
        deletedAt: null,
        // This is a simplified mutual count - in practice you'd need a more complex aggregation
      }),
    ]);

  return {
    followers: followersCount,
    following: followingCount,
    mutualFollows: mutualFollowsCount,
    ratio:
      followingCount > 0 ? (followersCount / followingCount).toFixed(2) : 0,
  };
};

followSchema.statics.getSuggestedFollows = async function (userId, limit = 10) {
  // Get users followed by people you follow (2nd degree connections)
  const following = await this.find({
    follower: userId,
    status: "active",
    deletedAt: null,
  }).select("following");

  const followingIds = following.map((f) => f.following);

  // Get suggestions based on mutual connections
  const suggestions = await this.aggregate([
    {
      $match: {
        follower: { $in: followingIds },
        following: { $ne: userId },
        status: "active",
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: "$following",
        mutualCount: { $sum: 1 },
        mutualConnections: { $push: "$follower" },
      },
    },
    { $sort: { mutualCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $project: {
        user: { $arrayElemAt: ["$user", 0] },
        mutualCount: 1,
        mutualConnections: 1,
      },
    },
  ]);

  return suggestions;
};

followSchema.statics.getRecentFollowers = function (userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    following: userId,
    followedAt: { $gte: startDate },
    status: "active",
    deletedAt: null,
  })
    .populate("follower", "name email avatar")
    .sort({ followedAt: -1 });
};

followSchema.statics.getActiveFollowers = function (userId, limit = 20) {
  return this.find({
    following: userId,
    status: "active",
    deletedAt: null,
  })
    .populate("follower", "name email avatar stats.lastActivity")
    .sort({ lastInteraction: -1, followedAt: -1 })
    .limit(limit);
};

// Pre-save middleware
followSchema.pre("save", async function (next) {
  // Update mutual follows count (simplified version)
  if (this.isNew) {
    try {
      const mutualFollow = await this.constructor.findOne({
        follower: this.following,
        following: this.follower,
        status: "active",
        deletedAt: null,
      });

      if (mutualFollow) {
        this.mutualFollows = 1;
        mutualFollow.mutualFollows = 1;
        await mutualFollow.save();
      }
    } catch (error) {
      console.warn("Error updating mutual follows:", error);
    }
  }

  next();
});

// Post-save middleware to update user stats
followSchema.post("save", async function (doc) {
  try {
    const User = require("./User");

    // Update follower count for the user being followed
    await User.findByIdAndUpdate(doc.following, {
      $inc: { "stats.followerCount": 1 },
      "stats.lastActivity": new Date(),
    });

    // Update following count for the user who followed
    await User.findByIdAndUpdate(doc.follower, {
      $inc: { "stats.followingCount": 1 },
      "stats.lastActivity": new Date(),
    });
  } catch (error) {
    console.error("Error updating user follow stats:", error);
  }
});

// Query middleware - exclude soft deleted by default
followSchema.pre(/^find/, function (next) {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
  next();
});

const Follow = mongoose.model("Follow", followSchema);

module.exports = Follow;
