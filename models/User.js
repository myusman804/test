const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Define referral history subdocument schema
const referralHistorySchema = new mongoose.Schema(
  {
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referredUserName: {
      type: String,
      required: true,
      trim: true,
    },
    referredUserEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    coinsEarned: {
      type: Number,
      default: 10,
      min: [0, "Coins earned cannot be negative"],
      max: [10000, "Coins earned cannot exceed 10,000 per referral"],
    },
    referredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "expired"],
      default: "pending",
    },
    bonusType: {
      type: String,
      enum: ["standard", "premium", "special"],
      default: "standard",
    },
  },
  {
    _id: true,
    timestamps: false, // Using referredAt instead
  }
);

// Define login attempts subdocument schema
const loginAttemptSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
    success: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
    timestamps: false,
  }
);

// Main User Schema
const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
      validate: {
        validator: function (name) {
          return /^[a-zA-Z\s]+$/.test(name);
        },
        message: "Name can only contain letters and spaces",
      },
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [320, "Email cannot exceed 320 characters"],
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email address",
      ],
      // Removed index: true to avoid duplicate
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      maxlength: [128, "Password cannot exceed 128 characters"],
      select: false, // Don't include in queries by default
      validate: {
        validator: function (password) {
          // Only validate on creation or when password is being changed
          if (this.isNew || this.isModified("password")) {
            const hasUpperCase = /[A-Z]/.test(password);
            const hasLowerCase = /[a-z]/.test(password);
            const hasNumbers = /\d/.test(password);
            const hasNonalphas = /\W/.test(password);
            return hasUpperCase && hasLowerCase && hasNumbers && hasNonalphas;
          }
          return true;
        },
        message:
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      },
    },

    // OTP fields
    otp: {
      type: String,
      select: false, // Don't include in queries by default
      validate: {
        validator: function (otp) {
          return !otp || /^\d{6}$/.test(otp);
        },
        message: "OTP must be exactly 6 digits",
      },
    },
    otpExpiry: {
      type: Date,
      select: false, // Don't include in queries by default
    },
    otpAttempts: {
      type: Number,
      default: 0,
      max: [30, "Too many OTP attempts"],
    },

    // Account status
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Referral system
    referralCode: {
      type: String,
      unique: true,
      required: true,
      uppercase: true,
      minlength: [6, "Referral code must be at least 6 characters"],
      maxlength: [20, "Referral code cannot exceed 20 characters"],
      match: [
        /^[A-Z0-9]+$/,
        "Referral code can only contain uppercase letters and numbers",
      ],
      // Removed index: true to avoid duplicate
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      // Removed index: true to avoid duplicate
    },

    // Coins and rewards
    coins: {
      type: Number,
      default: 0,
      min: [0, "Coins cannot be negative"],
      max: [999999999, "Coins cannot exceed 999,999,999"],
    },
    bonusCoins: {
      type: Number,
      default: 0,
      min: [0, "Bonus coins cannot be negative"],
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: [0, "Total earned cannot be negative"],
    },

    // Referral statistics
    referralCount: {
      type: Number,
      default: 0,
      min: [0, "Referral count cannot be negative"],
      max: [10000, "Referral count cannot exceed 10,000"],
    },
    successfulReferrals: {
      type: Number,
      default: 0,
      min: [0, "Successful referrals cannot be negative"],
    },
    referralHistory: [referralHistorySchema],

    // Authentication and security
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    lastLoginIP: {
      type: String,
      trim: true,
    },
    loginAttempts: [loginAttemptSchema],
    accountLockUntil: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },

    // Profile information
    avatar: {
      type: String,
      trim: true,
      validate: {
        validator: function (url) {
          return !url || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(url);
        },
        message: "Avatar must be a valid image URL",
      },
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (date) {
          return !date || (date < new Date() && date > new Date("1900-01-01"));
        },
        message: "Date of birth must be a valid past date",
      },
    },

    // Settings and preferences
    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      marketingEmails: {
        type: Boolean,
        default: false,
      },
      language: {
        type: String,
        enum: ["en", "es", "fr", "de", "it", "pt"],
        default: "en",
      },
      timezone: {
        type: String,
        default: "UTC",
        trim: true,
      },
    },

    // Admin and role management
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
      index: true,
    },
    permissions: [
      {
        type: String,
        enum: ["read", "write", "delete", "admin", "superadmin"],
      },
    ],

    // Analytics and tracking
    stats: {
      profileViews: { type: Number, default: 0, min: 0 },
      loginCount: { type: Number, default: 0, min: 0 },
      lastActivity: { type: Date, default: Date.now },
      // Add these new social media fields:
      imagesUploaded: { type: Number, default: 0, min: 0 },
      totalUploads: { type: Number, default: 0, min: 0 },
      followerCount: { type: Number, default: 0, min: 0 },
      followingCount: { type: Number, default: 0, min: 0 },
      totalLikes: { type: Number, default: 0, min: 0 },
      totalComments: { type: Number, default: 0, min: 0 },
      postsLiked: { type: Number, default: 0, min: 0 },
      commentsPosted: { type: Number, default: 0, min: 0 },
    },

    // Verification tokens
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpiry: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      select: false,
    },

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Remove sensitive fields from JSON output
        delete ret.password;
        delete ret.otp;
        delete ret.otpExpiry;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpiry;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpiry;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Compound indexes for better query performance
UserSchema.index({ email: 1, isActive: 1 });
UserSchema.index({ referralCode: 1, isActive: 1 });
UserSchema.index({ referredBy: 1, isVerified: 1 });
UserSchema.index({ isVerified: 1, isActive: 1 });
UserSchema.index({ referralCount: -1, coins: -1 }); // For leaderboards
UserSchema.index({ createdAt: -1, isVerified: 1 }); // For analytics
UserSchema.index({ lastLogin: -1, isActive: 1 }); // For user activity queries
UserSchema.index({ deletedAt: 1 }); // For soft delete queries

// Virtual fields
UserSchema.virtual("referralLink").get(function () {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/register?ref=${this.referralCode}`;
});

UserSchema.virtual("isAccountLocked").get(function () {
  return !!(this.accountLockUntil && this.accountLockUntil > Date.now());
});

UserSchema.methods.isFollowing = async function (userId) {
  const Follow = require("./Follow");
  return await Follow.isFollowing(this._id, userId);
};

UserSchema.virtual("membershipDuration").get(function () {
  return Math.floor(
    (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
});

UserSchema.virtual("conversionRate").get(function () {
  return this.referralCount > 0
    ? ((this.successfulReferrals / this.referralCount) * 100).toFixed(2)
    : 0;
});

UserSchema.virtual("averageCoinsPerReferral").get(function () {
  return this.referralCount > 0
    ? (this.coins / this.referralCount).toFixed(2)
    : 0;
});

// Pre-save middleware
UserSchema.pre("save", async function (next) {
  try {
    // Ensure referral code is uppercase
    if (this.referralCode) {
      this.referralCode = this.referralCode.toUpperCase();
    }

    // Update stats
    if (this.isNew) {
      this.stats.loginCount = 1;
    }

    // Clean up expired login attempts (keep only last 10)
    if (this.loginAttempts && this.loginAttempts.length > 10) {
      this.loginAttempts = this.loginAttempts
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware for referral history cleanup
UserSchema.pre("save", function (next) {
  // Keep referral history sorted by date (most recent first)
  if (this.isModified("referralHistory")) {
    this.referralHistory.sort(
      (a, b) => new Date(b.referredAt) - new Date(a.referredAt)
    );

    // Update successful referrals count
    this.successfulReferrals = this.referralHistory.filter(
      (ref) => ref.status === "verified"
    ).length;
  }

  next();
});

// Instance methods
UserSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

UserSchema.methods.getSocialStats = async function () {
  const Follow = require("./Follow");
  const Image = require("./Image");

  const [followStats, imageStats] = await Promise.all([
    Follow.getFollowStats(this._id),
    Image.aggregate([
      { $match: { createdBy: this._id, deletedAt: null } },
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
  ]);

  UserSchema.methods.recordLoginAttempt = function (
    ip,
    userAgent,
    success = false
  ) {
    const attempt = {
      ip,
      userAgent,
      success,
      timestamp: new Date(),
    };

    this.loginAttempts.unshift(attempt);

    // Keep only last 10 attempts
    if (this.loginAttempts.length > 10) {
      this.loginAttempts = this.loginAttempts.slice(0, 10);
    }

    if (success) {
      this.lastLogin = new Date();
      this.lastLoginIP = ip;
      this.stats.loginCount += 1;
      this.stats.lastActivity = new Date();

      // Reset failed attempts on successful login
      this.accountLockUntil = undefined;
    } else {
      // Check for too many failed attempts
      const recentFailedAttempts = this.loginAttempts.filter(
        (attempt) =>
          !attempt.success &&
          Date.now() - attempt.timestamp.getTime() < 15 * 60 * 1000 // 15 minutes
      ).length;

      if (recentFailedAttempts >= 5) {
        this.accountLockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes lock
      }
    }
  };

  UserSchema.methods.addReferral = function (referredUser, coinsEarned = 10) {
    const referral = {
      referredUser: referredUser._id,
      referredUserName: referredUser.name,
      referredUserEmail: referredUser.email,
      coinsEarned,
      referredAt: new Date(),
      status: "pending",
    };

    this.referralHistory.unshift(referral);
    this.referralCount += 1;
    this.coins += coinsEarned;
    this.totalEarned += coinsEarned;

    return referral;
  };

  UserSchema.methods.updateReferralStatus = function (referredUserId, status) {
    const referral = this.referralHistory.find(
      (ref) => ref.referredUser.toString() === referredUserId.toString()
    );

    if (referral) {
      referral.status = status;
      if (status === "verified") {
        this.successfulReferrals += 1;
      }
      return referral;
    }

    return null;
  };

  UserSchema.methods.canRefer = function () {
    return this.isVerified && this.isActive && !this.isAccountLocked;
  };

  UserSchema.methods.softDelete = function (deletedBy = null) {
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    this.isActive = false;
    return this.save();
  };

  UserSchema.methods.restore = function () {
    this.deletedAt = null;
    this.deletedBy = null;
    this.isActive = true;
    return this.save();
  };

  // Static methods
  UserSchema.statics.findActive = function () {
    return this.find({ isActive: true, deletedAt: null });
  };

  UserSchema.statics.findByReferralCode = function (code) {
    return this.findOne({
      referralCode: code.toUpperCase(),
      isActive: true,
      isVerified: true,
      deletedAt: null,
    });
  };

  UserSchema.statics.getLeaderboard = function (limit = 10) {
    return this.find({
      isVerified: true,
      isActive: true,
      referralCount: { $gt: 0 },
      deletedAt: null,
    })
      .select("name referralCode referralCount coins createdAt")
      .sort({ referralCount: -1, coins: -1, createdAt: 1 })
      .limit(limit)
      .lean();
  };

  UserSchema.statics.getUserStats = async function () {
    const [stats] = await this.aggregate([
      {
        $match: { deletedAt: null },
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          verifiedUsers: { $sum: { $cond: ["$isVerified", 1, 0] } },
          activeUsers: { $sum: { $cond: ["$isActive", 1, 0] } },
          totalReferrals: { $sum: "$referralCount" },
          totalCoins: { $sum: "$coins" },
          avgReferralsPerUser: { $avg: "$referralCount" },
          avgCoinsPerUser: { $avg: "$coins" },
        },
      },
    ]);

    return (
      stats || {
        totalUsers: 0,
        verifiedUsers: 0,
        activeUsers: 0,
        totalReferrals: 0,
        totalCoins: 0,
        avgReferralsPerUser: 0,
        avgCoinsPerUser: 0,
      }
    );
  };

  const imageData = imageStats[0] || {
    totalImages: 0,
    totalLikes: 0,
    totalComments: 0,
    totalViews: 0,
  };

  return {
    followers: followStats.followers,
    following: followStats.following,
    mutualFollows: followStats.mutualFollows,
    followRatio: followStats.ratio,
    images: imageData.totalImages,
    likesReceived: imageData.totalLikes,
    commentsReceived: imageData.totalComments,
    views: imageData.totalViews,
    engagementRate:
      imageData.totalViews > 0
        ? (
            ((imageData.totalLikes + imageData.totalComments) /
              imageData.totalViews) *
            100
          ).toFixed(2)
        : 0,
  };
};

// Query middleware
UserSchema.pre(/^find/, function (next) {
  // Exclude soft deleted users by default
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
  next();
});

// Create the model
const User = mongoose.model("User", UserSchema);

module.exports = User;
