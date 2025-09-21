const mongoose = require("mongoose");

// Comment subdocument schema
const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
      minlength: [1, "Comment must be at least 1 character long"],
      maxlength: [500, "Comment cannot exceed 500 characters"],
    },
    likes: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        likedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    likeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    // Nested replies (simple threading)
    replies: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        userName: String,
        content: {
          type: String,
          required: true,
          trim: true,
          maxlength: 300,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Main Image Schema
const imageSchema = new mongoose.Schema(
  {
    // Core image data
    filename: {
      type: String,
      required: [true, "Filename is required"],
      unique: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, "Original filename is required"],
      trim: true,
    },
    url: {
      type: String,
      required: [true, "Image URL is required"],
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      required: [true, "Thumbnail URL is required"],
      trim: true,
    },

    // User and creation info
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
      index: true,
    },
    createdByName: {
      type: String,
      required: true,
      trim: true,
    },
    createdByEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Content and metadata
    content: {
      type: String,
      trim: true,
      maxlength: [2000, "Content cannot exceed 2000 characters"],
      default: "",
    },

    // Technical details
    size: {
      type: Number,
      required: true,
      min: [0, "Size cannot be negative"],
    },
    dimensions: {
      width: {
        type: Number,
        required: true,
        min: [1, "Width must be positive"],
      },
      height: {
        type: Number,
        required: true,
        min: [1, "Height must be positive"],
      },
    },
    format: {
      type: String,
      required: true,
      enum: ["jpeg", "jpg", "png", "webp", "gif"],
      lowercase: true,
    },
    compressionRatio: {
      type: String,
      default: "0%",
    },

    // Social features
    likes: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        userName: String,
        likedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    likeCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    comments: [commentSchema],
    commentCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Engagement metrics
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    viewedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
        ipAddress: String,
      },
    ],

    // Content moderation
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    isReported: {
      type: Boolean,
      default: false,
      index: true,
    },
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reports: [
      {
        reportedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        reason: {
          type: String,
          enum: ["spam", "inappropriate", "copyright", "harassment", "other"],
          required: true,
        },
        description: {
          type: String,
          maxlength: 500,
        },
        reportedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Admin moderation
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "flagged"],
      default: "approved",
      index: true,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: {
      type: Date,
    },
    moderationNote: {
      type: String,
      maxlength: 500,
    },

    // Categories and tags
    category: {
      type: String,
      enum: [
        "general",
        "nature",
        "people",
        "technology",
        "art",
        "food",
        "travel",
        "sports",
        "business",
        "education",
        "other",
      ],
      default: "general",
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 50,
      },
    ],

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

// Compound indexes for better query performance
imageSchema.index({ createdBy: 1, createdAt: -1 });
imageSchema.index({ createdAt: -1, isPublic: 1 });
imageSchema.index({ likeCount: -1, createdAt: -1 });
imageSchema.index({ category: 1, createdAt: -1 });
imageSchema.index({ tags: 1, isPublic: 1 });
imageSchema.index({ moderationStatus: 1, createdAt: -1 });
imageSchema.index({ deletedAt: 1 });

// Text search index
imageSchema.index({
  content: "text",
  originalName: "text",
  tags: "text",
  createdByName: "text",
});

// Virtual fields
imageSchema.virtual("aspectRatio").get(function () {
  return (this.dimensions.width / this.dimensions.height).toFixed(2);
});

imageSchema.virtual("sizeFormatted").get(function () {
  return formatBytes(this.size);
});

imageSchema.virtual("timeAgo").get(function () {
  return getTimeAgo(this.createdAt);
});

imageSchema.virtual("engagementRate").get(function () {
  const totalEngagement = this.likeCount + this.commentCount;
  return this.views > 0 ? ((totalEngagement / this.views) * 100).toFixed(2) : 0;
});

imageSchema.virtual("isLikedBy").get(function () {
  // This will be set dynamically in controllers
  return false;
});

// Instance methods
imageSchema.methods.addLike = function (userId, userName) {
  const existingLike = this.likes.find(
    (like) => like.user.toString() === userId.toString()
  );

  if (existingLike) {
    throw new Error("User has already liked this image");
  }

  this.likes.push({
    user: userId,
    userName,
    likedAt: new Date(),
  });

  this.likeCount = this.likes.length;
  return this.save();
};

imageSchema.methods.removeLike = function (userId) {
  const likeIndex = this.likes.findIndex(
    (like) => like.user.toString() === userId.toString()
  );

  if (likeIndex === -1) {
    throw new Error("User has not liked this image");
  }

  this.likes.splice(likeIndex, 1);
  this.likeCount = this.likes.length;
  return this.save();
};

imageSchema.methods.addComment = function (
  userId,
  userName,
  userEmail,
  content
) {
  const comment = {
    user: userId,
    userName,
    userEmail,
    content: content.trim(),
  };

  this.comments.push(comment);
  this.commentCount = this.comments.length;
  return this.save();
};

imageSchema.methods.deleteComment = function (commentId, userId) {
  const comment = this.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user.toString() !== userId.toString()) {
    throw new Error("Not authorized to delete this comment");
  }

  comment.remove();
  this.commentCount = this.comments.length;
  return this.save();
};

imageSchema.methods.addView = function (userId = null, ipAddress = null) {
  // Don't count views from the image owner
  if (userId && userId.toString() === this.createdBy.toString()) {
    return Promise.resolve(this);
  }

  // Check if this user/IP has viewed recently (within last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentView = this.viewedBy.find((view) => {
    if (userId && view.user) {
      return (
        view.user.toString() === userId.toString() && view.viewedAt > oneHourAgo
      );
    }
    if (ipAddress && view.ipAddress) {
      return view.ipAddress === ipAddress && view.viewedAt > oneHourAgo;
    }
    return false;
  });

  if (!recentView) {
    this.views += 1;
    this.viewedBy.push({
      user: userId,
      ipAddress,
      viewedAt: new Date(),
    });

    // Keep only last 100 view records to prevent bloat
    if (this.viewedBy.length > 100) {
      this.viewedBy = this.viewedBy
        .sort((a, b) => b.viewedAt - a.viewedAt)
        .slice(0, 100);
    }
  }

  return this.save();
};

imageSchema.methods.addReport = function (
  reportedBy,
  reason,
  description = ""
) {
  // Check if user has already reported this image
  const existingReport = this.reports.find(
    (report) => report.reportedBy.toString() === reportedBy.toString()
  );

  if (existingReport) {
    throw new Error("You have already reported this image");
  }

  this.reports.push({
    reportedBy,
    reason,
    description,
    reportedAt: new Date(),
  });

  this.reportCount = this.reports.length;
  this.isReported = true;

  // Auto-flag if multiple reports
  if (this.reportCount >= 3) {
    this.moderationStatus = "flagged";
  }

  return this.save();
};

imageSchema.methods.softDelete = function (deletedBy = null) {
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

imageSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

// Static methods
imageSchema.statics.findPublic = function () {
  return this.find({
    isPublic: true,
    deletedAt: null,
    moderationStatus: { $in: ["approved", "pending"] },
  });
};

imageSchema.statics.findByUser = function (userId) {
  return this.find({
    createdBy: userId,
    deletedAt: null,
  });
};

imageSchema.statics.getPopular = function (limit = 20, timeframe = "week") {
  const timeMap = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  const startDate = new Date(Date.now() - (timeMap[timeframe] || timeMap.week));

  return this.find({
    createdAt: { $gte: startDate },
    isPublic: true,
    deletedAt: null,
    moderationStatus: "approved",
  })
    .sort({ likeCount: -1, views: -1, createdAt: -1 })
    .limit(limit)
    .populate("createdBy", "name email referralCode");
};

imageSchema.statics.searchImages = function (query, options = {}) {
  const {
    category = null,
    tags = [],
    userId = null,
    sortBy = "createdAt",
    sortOrder = "desc",
    limit = 20,
    skip = 0,
  } = options;

  const searchQuery = {
    $text: { $search: query },
    isPublic: true,
    deletedAt: null,
    moderationStatus: "approved",
  };

  if (category) searchQuery.category = category;
  if (tags.length > 0) searchQuery.tags = { $in: tags };
  if (userId) searchQuery.createdBy = userId;

  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  return this.find(searchQuery)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate("createdBy", "name email");
};

// Pre-save middleware
imageSchema.pre("save", function (next) {
  // Update comment count
  this.commentCount = this.comments.length;

  // Update like count
  this.likeCount = this.likes.length;

  // Clean up old view records (keep only last 100)
  if (this.viewedBy && this.viewedBy.length > 100) {
    this.viewedBy = this.viewedBy
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, 100);
  }

  next();
});

// Query middleware - exclude soft deleted by default
imageSchema.pre(/^find/, function (next) {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
  next();
});

// Helper functions
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getTimeAgo(date) {
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

const Image = mongoose.model("Image", imageSchema);

module.exports = Image;
