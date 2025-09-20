const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
      match: [/^[a-zA-Z\s]+$/, "Name can only contain letters and spaces"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email address",
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false, // Don't include password in queries by default
    },
    otp: {
      type: String,
      select: false, // Don't include OTP in queries by default
    },
    otpExpiry: {
      type: Date,
      select: false, // Don't include OTP expiry in queries by default
    },
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    referralCode: {
      type: String,
      unique: true,
      required: true,
      uppercase: true,
      index: true,
      minlength: [6, "Referral code must be at least 6 characters"],
      maxlength: [20, "Referral code cannot exceed 20 characters"],
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    coins: {
      type: Number,
      default: 0,
      min: [0, "Coins cannot be negative"],
      validate: {
        validator: function (value) {
          return Number.isInteger(value);
        },
        message: "Coins must be a whole number",
      },
    },
    referralCount: {
      type: Number,
      default: 0,
      min: [0, "Referral count cannot be negative"],
      validate: {
        validator: function (value) {
          return Number.isInteger(value);
        },
        message: "Referral count must be a whole number",
      },
    },
    referralHistory: [
      {
        referredUser: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
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
          validate: {
            validator: function (value) {
              return Number.isInteger(value);
            },
            message: "Coins earned must be a whole number",
          },
        },
        referredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Additional security fields
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    // Profile completion tracking
    profileComplete: {
      type: Boolean,
      default: false,
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
        delete ret.loginAttempts;
        delete ret.lockUntil;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
UserSchema.index({ referralCode: 1 }, { unique: true });
UserSchema.index({ referredBy: 1 });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ isVerified: 1, isActive: 1 });
UserSchema.index({ referralCount: -1, coins: -1 }); // For leaderboard queries
UserSchema.index({ createdAt: -1 }); // For recent users queries
UserSchema.index({ lastLogin: -1 }); // For active users tracking

// Virtual for account lock status
UserSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual for referral link
UserSchema.virtual("referralLink").get(function () {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/register?ref=${this.referralCode}`;
});

// Virtual for total referral earnings
UserSchema.virtual("totalReferralEarnings").get(function () {
  return this.referralHistory.reduce(
    (total, ref) => total + (ref.coinsEarned || 0),
    0
  );
});

// Pre-save middleware
UserSchema.pre("save", function (next) {
  // Ensure referral code is uppercase
  if (this.referralCode) {
    this.referralCode = this.referralCode.toUpperCase();
  }

  // Trim and format name
  if (this.name) {
    this.name = this.name.trim();
  }

  // Ensure email is lowercase
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }

  next();
});

// Pre-find middleware to populate referral history by default
UserSchema.pre(/^find/, function () {
  // Only populate if explicitly requested to avoid performance issues
  if (this.getOptions().populate) {
    this.populate(
      "referralHistory.referredUser",
      "name email createdAt isVerified"
    );
  }
});

// Static method to find users with referrals
UserSchema.statics.findUsersWithReferrals = function () {
  return this.find({
    isVerified: true,
    isActive: true,
    referralCount: { $gt: 0 },
  });
};

// Static method for leaderboard
UserSchema.statics.getLeaderboard = function (limit = 10, skip = 0) {
  return this.find({
    isVerified: true,
    isActive: true,
    referralCount: { $gt: 0 },
  })
    .select("name referralCode referralCount coins createdAt")
    .sort({ referralCount: -1, coins: -1, createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Instance method to check if user can refer
UserSchema.methods.canRefer = function () {
  return this.isVerified && this.isActive && !this.isLocked;
};

// Instance method to add referral
UserSchema.methods.addReferral = async function (
  referredUser,
  coinsEarned = 10
) {
  this.referralHistory.push({
    referredUser: referredUser._id,
    referredUserName: referredUser.name,
    referredUserEmail: referredUser.email,
    coinsEarned,
    referredAt: new Date(),
  });

  this.referralCount += 1;
  this.coins += coinsEarned;

  return this.save();
};

// Instance method to increment login attempts
UserSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// Instance method to reset login attempts
UserSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

const User = mongoose.model("User", UserSchema);

module.exports = User;
