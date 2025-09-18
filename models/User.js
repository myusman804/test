const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    otp: { type: String },
    otpExpiry: { type: Date },
    isVerified: { type: Boolean, default: false },

    // Referral System Fields
    referralCode: {
      type: String,
      unique: true,
      required: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    coins: {
      type: Number,
      default: 0,
    },
    referralCount: {
      type: Number,
      default: 0,
    },
    referralHistory: [
      {
        referredUser: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        referredUserName: String,
        referredUserEmail: String,
        coinsEarned: {
          type: Number,
          default: 10,
        },
        referredAt: {
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

// Index for better performance
UserSchema.index({ referralCode: 1 });
UserSchema.index({ referredBy: 1 });

const User = mongoose.model("User", UserSchema);
module.exports = User;
