const express = require("express");
const {
  register,
  verifyOTP,
  resendOTP,
  login,
  logout,
  dashboard,
  getUserCounts,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  requireAdmin,
  checkAdminStatus,
  requireSuperAdmin,
} = require("../middleware/adminMiddleware");
const {
  validateRegistration,
  validateLogin,
  validateOTP,
  sanitizeInput,
} = require("../middleware/validation");
const {
  authLimiter,
  otpLimiter,
  adminLimiter,
  sensitiveLimiter,
} = require("../middleware/rateLimiter");

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeInput);

console.log("🔗 Setting up authentication routes...");

// ===== PUBLIC ROUTES =====

// User registration
router.post(
  "/register",
  authLimiter, // Rate limiting for auth operations
  validateRegistration,
  register
);
console.log("✅ POST /register route registered");

// OTP verification
router.post(
  "/verify-otp",
  otpLimiter, // Strict rate limiting for OTP
  validateOTP,
  verifyOTP
);
console.log("✅ POST /verify-otp route registered");

// Resend OTP
router.post(
  "/resend-otp",
  otpLimiter, // Same strict rate limiting
  validateOTP, // Reuse OTP validation (only email required)
  resendOTP
);
console.log("✅ POST /resend-otp route registered");

// User login
router.post("/login", authLimiter, validateLogin, login);
console.log("✅ POST /login route registered");

// ===== PROTECTED ROUTES =====

// User logout
router.post(
  "/logout",
  authMiddleware, // Require authentication
  logout
);
console.log("✅ POST /logout route registered");

// User dashboard
router.get(
  "/dashboard",
  authMiddleware,
  checkAdminStatus, // Optional admin status check
  dashboard
);
console.log("✅ GET /dashboard route registered");

// Get user profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user.id)
      .select("-password -otp -otpExpiry")
      .populate("referralHistory.referredUser", "name email");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    res.json({
      success: true,
      message: "Profile retrieved successfully",
      data: {
        user: {
          ...user.toObject(),
          membershipDuration: user.membershipDuration,
          conversionRate: user.conversionRate,
          averageCoinsPerReferral: user.averageCoinsPerReferral,
        },
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
console.log("✅ GET /profile route registered");

// Update user profile
router.put(
  "/profile",
  authMiddleware,
  sensitiveLimiter, // Limit sensitive operations
  async (req, res) => {
    try {
      const { name, bio, preferences } = req.body;
      const User = require("../models/User");

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (bio !== undefined) updateData.bio = bio.trim();
      if (preferences) updateData.preferences = { ...preferences };

      const user = await User.findByIdAndUpdate(req.user.id, updateData, {
        new: true,
        runValidators: true,
      }).select("-password -otp -otpExpiry");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: { user },
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ PUT /profile route registered");

// ===== ADMIN ROUTES =====

// Get user counts and statistics (Admin only)
router.get(
  "/users-count",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  getUserCounts
);
console.log("✅ GET /users-count route registered");

// Verify admin status
router.get("/verify-admin", authMiddleware, (req, res) => {
  const { checkIsAdmin } = require("../controllers/authController");
  const isAdmin = checkIsAdmin(req.user.email);

  res.json({
    success: true,
    message: "Admin status verified",
    data: {
      isAdmin: isAdmin && req.user.is_admin,
      adminConfirmed: req.user.adminConfirmed || false,
      user: {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role || "user",
      },
      timestamp: new Date().toISOString(),
    },
  });
});
console.log("✅ GET /verify-admin route registered");

// Get all users (Admin only)
router.get(
  "/users",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        filter,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;
      const User = require("../models/User");

      // Build query
      const query = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { referralCode: { $regex: search, $options: "i" } },
        ];
      }

      if (filter) {
        switch (filter) {
          case "verified":
            query.isVerified = true;
            break;
          case "unverified":
            query.isVerified = false;
            break;
          case "active":
            query.isActive = true;
            break;
          case "inactive":
            query.isActive = false;
            break;
        }
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [users, totalCount] = await Promise.all([
        User.find(query)
          .select(
            "-password -otp -otpExpiry -emailVerificationToken -passwordResetToken"
          )
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(query),
      ]);

      res.json({
        success: true,
        message: "Users retrieved successfully",
        data: {
          users,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalUsers: totalCount,
            hasMore: skip + users.length < totalCount,
          },
        },
      });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve users",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /users route registered");

// Update user status (Admin only)
router.patch(
  "/users/:userId",
  authMiddleware,
  requireAdmin,
  sensitiveLimiter,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { isActive, isVerified, coins, role } = req.body;
      const User = require("../models/User");

      const updateData = {};
      if (typeof isActive === "boolean") updateData.isActive = isActive;
      if (typeof isVerified === "boolean") updateData.isVerified = isVerified;
      if (typeof coins === "number" && coins >= 0) updateData.coins = coins;
      if (role && ["user", "admin"].includes(role)) updateData.role = role;

      const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true,
      }).select("-password -otp -otpExpiry");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Log admin action
      console.log(
        `👑 Admin action: ${req.user.email} updated user ${user.email}`,
        {
          adminId: req.user.id,
          targetUserId: userId,
          changes: updateData,
          timestamp: new Date().toISOString(),
        }
      );

      res.json({
        success: true,
        message: "User updated successfully",
        data: { user },
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update user",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ PATCH /users/:userId route registered");

// ===== SUPER ADMIN ROUTES =====

// Delete user permanently (Super Admin only)
router.delete(
  "/users/:userId",
  authMiddleware,
  requireSuperAdmin,
  sensitiveLimiter,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { permanent = false } = req.query;
      const User = require("../models/User");

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (permanent === "true") {
        await User.findByIdAndDelete(userId);
        console.log(
          `🗑️  Super Admin: ${req.user.email} permanently deleted user ${user.email}`
        );
      } else {
        await user.softDelete(req.user.id);
        console.log(
          `🗑️  Super Admin: ${req.user.email} soft deleted user ${user.email}`
        );
      }

      res.json({
        success: true,
        message:
          permanent === "true"
            ? "User permanently deleted"
            : "User deactivated",
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete user",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ DELETE /users/:userId route registered");

// ===== UTILITY ROUTES =====

// Health check for auth service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Authentication service is healthy",
    timestamp: new Date().toISOString(),
    service: "auth",
  });
});
console.log("✅ GET /health route registered");

// Route information
router.get("/routes", (req, res) => {
  const routes = [
    {
      method: "POST",
      path: "/register",
      description: "Register new user",
      public: true,
    },
    {
      method: "POST",
      path: "/verify-otp",
      description: "Verify OTP",
      public: true,
    },
    {
      method: "POST",
      path: "/resend-otp",
      description: "Resend OTP",
      public: true,
    },
    { method: "POST", path: "/login", description: "User login", public: true },
    {
      method: "POST",
      path: "/logout",
      description: "User logout",
      protected: true,
    },
    {
      method: "GET",
      path: "/dashboard",
      description: "User dashboard",
      protected: true,
    },
    {
      method: "GET",
      path: "/profile",
      description: "Get user profile",
      protected: true,
    },
    {
      method: "PUT",
      path: "/profile",
      description: "Update user profile",
      protected: true,
    },
    {
      method: "GET",
      path: "/users-count",
      description: "Get user statistics",
      admin: true,
    },
    {
      method: "GET",
      path: "/verify-admin",
      description: "Verify admin status",
      protected: true,
    },
    {
      method: "GET",
      path: "/users",
      description: "List all users",
      admin: true,
    },
    {
      method: "PATCH",
      path: "/users/:userId",
      description: "Update user",
      admin: true,
    },
    {
      method: "DELETE",
      path: "/users/:userId",
      description: "Delete user",
      superAdmin: true,
    },
  ];

  res.json({
    success: true,
    message: "Authentication routes",
    routes,
  });
});

console.log("🎉 Authentication routes setup completed successfully!");

module.exports = router;
