const express = require("express");
const {
  uploadMiddleware,
  uploadImages,
  getImages,
  getUserImages,
  toggleLike,
  addComment,
  deleteComment,
  getImageDetails,
  deleteImage,
} = require("../controllers/imageController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  requireAdmin,
  checkAdminStatus,
} = require("../middleware/adminMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const {
  uploadLimiter,
  generalLimiter,
  adminLimiter,
} = require("../middleware/rateLimiter");
const { sanitizeInput } = require("../middleware/validation");

const router = express.Router();

console.log("🖼️  Setting up image routes...");

// Apply sanitization to all routes
router.use(sanitizeInput);

// ===== PUBLIC/OPTIONAL AUTH ROUTES =====

// Get all public images (with optional user context)
router.get(
  "/",
  optionalAuth, // Optional authentication for better user experience
  generalLimiter,
  getImages
);
console.log("✅ GET / route registered (public images)");

// Get specific image details
router.get("/:imageId", optionalAuth, generalLimiter, getImageDetails);
console.log("✅ GET /:imageId route registered");

// ===== PROTECTED ROUTES (Require Authentication) =====

// Upload images
router.post(
  "/upload",
  authMiddleware,
  uploadLimiter, // Rate limiting for uploads
  uploadMiddleware, // Handle file upload
  uploadImages // Process upload
);
console.log("✅ POST /upload route registered");

// Get user's uploaded images
router.get("/user/my-images", authMiddleware, generalLimiter, getUserImages);
console.log("✅ GET /user/my-images route registered");

// Like/Unlike image
router.post("/:imageId/like", authMiddleware, generalLimiter, toggleLike);
console.log("✅ POST /:imageId/like route registered");

// Add comment to image
router.post("/:imageId/comments", authMiddleware, generalLimiter, addComment);
console.log("✅ POST /:imageId/comments route registered");

// Delete comment
router.delete(
  "/:imageId/comments/:commentId",
  authMiddleware,
  generalLimiter,
  deleteComment
);
console.log("✅ DELETE /:imageId/comments/:commentId route registered");

// Delete image
router.delete("/:imageId", authMiddleware, uploadLimiter, deleteImage);
console.log("✅ DELETE /:imageId route registered");

// Get images by category
router.get(
  "/category/:category",
  optionalAuth,
  generalLimiter,
  async (req, res) => {
    req.query.category = req.params.category;
    getImages(req, res);
  }
);
console.log("✅ GET /category/:category route registered");

// Search images
router.get("/search/:query", optionalAuth, generalLimiter, async (req, res) => {
  try {
    const { query } = req.params;
    const {
      page = 1,
      limit = 20,
      category,
      sortBy = "relevance",
      sortOrder = "desc",
    } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      });
    }

    const Image = require("../models/Image");

    const searchOptions = {
      category,
      sortBy: sortBy === "relevance" ? "createdAt" : sortBy,
      sortOrder,
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    };

    const results = await Image.searchImages(query, searchOptions);
    const totalCount = await Image.countDocuments({
      $text: { $search: query },
      isPublic: true,
      deletedAt: null,
      moderationStatus: "approved",
      ...(category && { category }),
    });

    res.json({
      success: true,
      message: "Search completed successfully",
      data: {
        images: results,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalResults: totalCount,
          hasMore: searchOptions.skip + results.length < totalCount,
        },
        searchQuery: query,
        filters: {
          category,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    console.error("Image search error:", error);
    res.status(500).json({
      success: false,
      message: "Search failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
console.log("✅ GET /search/:query route registered");

// Get popular/trending images
// Without timeframe (defaults to "week")
router.get("/trending", optionalAuth, generalLimiter, async (req, res) => {
  try {
    const timeframe = "week"; // default
    const { limit = 20 } = req.query;
    const Image = require("../models/Image");
    const trendingImages = await Image.getPopular(parseInt(limit), timeframe);

    res.json({
      success: true,
      message: `Trending images (${timeframe}) retrieved successfully`,
      data: {
        images: trendingImages,
        timeframe,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get trending images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve trending images",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// With timeframe param
router.get(
  "/trending/:timeframe",
  optionalAuth,
  generalLimiter,
  async (req, res) => {
    try {
      const { timeframe } = req.params;
      const { limit = 20 } = req.query;
      const Image = require("../models/Image");
      const trendingImages = await Image.getPopular(parseInt(limit), timeframe);

      res.json({
        success: true,
        message: `Trending images (${timeframe}) retrieved successfully`,
        data: {
          images: trendingImages,
          timeframe,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Get trending images error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve trending images",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// ===== ADMIN ROUTES =====

// Get all images (Admin only)
router.get(
  "/admin/all",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        sortBy = "createdAt",
        sortOrder = "desc",
        userId,
        category,
        status = "approved",
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const Image = require("../models/Image");

      const query = {};
      if (userId) query.createdBy = userId;
      if (category) query.category = category;
      if (status) query.moderationStatus = status;

      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const [images, totalCount] = await Promise.all([
        Image.find(query)
          .populate("createdBy", "name email referralCode")
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Image.countDocuments(query),
      ]);

      res.json({
        success: true,
        message: "All images retrieved successfully (Admin)",
        data: {
          images,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalImages: totalCount,
            hasMore: skip + images.length < totalCount,
          },
          filters: {
            userId,
            category,
            status,
            sortBy,
            sortOrder,
          },
        },
        adminRequest: {
          requestedBy: req.user.email,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Admin get all images error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve images",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /admin/all route registered");

// Moderate image (Admin only)
router.patch(
  "/admin/:imageId/moderate",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const { imageId } = req.params;
      const { status, note } = req.body;

      const validStatuses = ["approved", "rejected", "flagged", "pending"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(
            ", "
          )}`,
        });
      }

      const Image = require("../models/Image");
      const image = await Image.findById(imageId);

      if (!image) {
        return res.status(404).json({
          success: false,
          message: "Image not found",
        });
      }

      image.moderationStatus = status;
      image.moderatedBy = req.user.id;
      image.moderatedAt = new Date();
      if (note) image.moderationNote = note;

      await image.save();

      // Log admin action
      console.log(
        `👑 Admin moderation: ${req.user.email} set image ${imageId} to ${status}`
      );

      res.json({
        success: true,
        message: "Image moderation status updated successfully",
        data: {
          imageId,
          newStatus: status,
          moderatedBy: req.user.email,
          moderatedAt: image.moderatedAt,
          note: image.moderationNote,
        },
      });
    } catch (error) {
      console.error("Admin moderate image error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to moderate image",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ PATCH /admin/:imageId/moderate route registered");

// Get upload statistics (Admin only)
router.get(
  "/admin/stats",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const { period = "30" } = req.query;
      const periodDays = parseInt(period);
      const Image = require("../models/Image");
      const User = require("../models/User");

      const periodStart = new Date(
        Date.now() - periodDays * 24 * 60 * 60 * 1000
      );

      const [totalStats, periodStats, categoryStats, topUploaders] =
        await Promise.all([
          Image.aggregate([
            { $match: { deletedAt: null } },
            {
              $group: {
                _id: null,
                totalImages: { $sum: 1 },
                totalSize: { $sum: "$size" },
                totalLikes: { $sum: "$likeCount" },
                totalComments: { $sum: "$commentCount" },
                totalViews: { $sum: "$views" },
                avgLikes: { $avg: "$likeCount" },
                avgComments: { $avg: "$commentCount" },
              },
            },
          ]),
          Image.aggregate([
            {
              $match: {
                createdAt: { $gte: periodStart },
                deletedAt: null,
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
                size: { $sum: "$size" },
                likes: { $sum: "$likeCount" },
                comments: { $sum: "$commentCount" },
              },
            },
            { $sort: { _id: 1 } },
          ]),
          Image.aggregate([
            { $match: { deletedAt: null } },
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
                avgLikes: { $avg: "$likeCount" },
                avgComments: { $avg: "$commentCount" },
              },
            },
            { $sort: { count: -1 } },
          ]),
          Image.aggregate([
            { $match: { deletedAt: null } },
            {
              $group: {
                _id: "$createdBy",
                totalImages: { $sum: 1 },
                totalLikes: { $sum: "$likeCount" },
                totalComments: { $sum: "$commentCount" },
                createdByName: { $first: "$createdByName" },
                createdByEmail: { $first: "$createdByEmail" },
              },
            },
            { $sort: { totalImages: -1 } },
            { $limit: 10 },
          ]),
        ]);

      const stats = {
        overview: totalStats[0] || {
          totalImages: 0,
          totalSize: 0,
          totalLikes: 0,
          totalComments: 0,
          totalViews: 0,
          avgLikes: 0,
          avgComments: 0,
        },
        period: {
          days: periodDays,
          dailyStats: periodStats,
          totalPeriodUploads: periodStats.reduce(
            (sum, day) => sum + day.count,
            0
          ),
        },
        categories: categoryStats,
        topUploaders,
        generatedAt: new Date().toISOString(),
        requestedBy: req.user.email,
      };

      // Format file sizes
      stats.overview.totalSizeFormatted = formatBytes(stats.overview.totalSize);
      stats.overview.avgFileSize =
        stats.overview.totalImages > 0
          ? formatBytes(stats.overview.totalSize / stats.overview.totalImages)
          : "0 Bytes";

      res.json({
        success: true,
        message: "Upload statistics retrieved successfully",
        data: stats,
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve upload statistics",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /admin/stats route registered");

// Get reported images (Admin only)
router.get(
  "/admin/reported",
  authMiddleware,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const Image = require("../models/Image");

      const [reportedImages, totalCount] = await Promise.all([
        Image.find({
          isReported: true,
          deletedAt: null,
        })
          .populate("createdBy", "name email")
          .sort({ reportCount: -1, updatedAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Image.countDocuments({
          isReported: true,
          deletedAt: null,
        }),
      ]);

      res.json({
        success: true,
        message: "Reported images retrieved successfully",
        data: {
          images: reportedImages,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalReported: totalCount,
            hasMore: skip + reportedImages.length < totalCount,
          },
        },
      });
    } catch (error) {
      console.error("Get reported images error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve reported images",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);
console.log("✅ GET /admin/reported route registered");

// ===== UTILITY ROUTES =====

// Health check for image service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Image service is healthy",
    timestamp: new Date().toISOString(),
    service: "images",
    features: {
      upload: true,
      processing: true,
      thumbnails: true,
      likes: true,
      comments: true,
      moderation: true,
    },
    uploadConfig: {
      maxFileSize: "5MB",
      allowedTypes: ["JPEG", "PNG", "WebP", "GIF"],
      maxFiles: 5,
      processingEnabled: true,
    },
  });
});
console.log("✅ GET /health route registered");

// Get upload configuration (for frontend)
router.get("/config", (req, res) => {
  res.json({
    success: true,
    message: "Upload configuration",
    data: {
      upload: {
        maxFileSize: 5 * 1024 * 1024, // 5MB in bytes
        maxFileSizeFormatted: "5MB",
        allowedTypes: [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/gif",
        ],
        maxFiles: 5,
        acceptedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      },
      processing: {
        autoResize: true,
        maxWidth: 1920,
        maxHeight: 1920,
        thumbnailSize: 300,
        compressionEnabled: true,
        formatConversion: "JPEG for optimization",
      },
      social: {
        likesEnabled: true,
        commentsEnabled: true,
        maxCommentLength: 500,
        moderationEnabled: true,
      },
      categories: [
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
    },
  });
});
console.log("✅ GET /config route registered");

// Helper function
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

console.log("🎉 Image routes setup completed successfully!");

module.exports = router;
