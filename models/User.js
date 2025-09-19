const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    otp: { type: String },
    otpExpiry: { type: Date },
    isVerified: { type: Boolean, default: false },

    referralCode: {
      type: String,
      unique: true,
      required: true,
      uppercase: true,
      index: true,
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
    },
    referralCount: {
      type: Number,
      default: 0,
      min: [0, "Referral count cannot be negative"],
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
        },
        referredUserEmail: {
          type: String,
          required: true,
        },
        coinsEarned: {
          type: Number,
          default: 10,
          min: [0, "Coins earned cannot be negative"],
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
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ referralCode: 1 });
UserSchema.index({ referredBy: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ isVerified: 1 });
UserSchema.index({ referralCount: -1 }); // For leaderboard queries

UserSchema.pre("save", function (next) {
  if (this.referralCode) {
    this.referralCode = this.referralCode.toUpperCase();
  }
  next();
});

UserSchema.virtual("referralLink").get(function () {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/register?ref=${this.referralCode}`;
});

UserSchema.set("toJSON", { virtuals: true });
UserSchema.set("toObject", { virtuals: true });

const User = mongoose.model("User", UserSchema);
module.exports = User;
