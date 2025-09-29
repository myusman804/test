const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const crypto = require("crypto");
const User = require("../models/User");
const Image = require("../models/Image");
const Follow = require("../models/Follow");

// Configuration constants
const UPLOAD_CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ],
  maxWidth: 1920,
  maxHeight: 1920,
  thumbnailSize: 300,
  uploadDir: "uploads/images",
  thumbnailDir: "uploads/thumbnails",
};

// Ensure upload directories exist
const ensureDirectories = async () => {
  try {
    await fs.mkdir(UPLOAD_CONFIG.uploadDir, { recursive: true });
    await fs.mkdir(UPLOAD_CONFIG.thumbnailDir, { recursive: true });
    console.log("✅ Upload directories ensured");
  } catch (error) {
    console.error("❌ Error creating upload directories:", error);
  }
};

// Initialize directories
ensureDirectories();

// Generate unique filename
const generateFileName = (originalname) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  const ext = path.extname(originalname).toLowerCase();
  return `img_${timestamp}_${random}${ext}`;
};

// Custom file filter
const fileFilter = (req, file, cb) => {
  if (!UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
    const error = new Error(
      `Invalid file type. Allowed types: ${UPLOAD_CONFIG.allowedMimeTypes.join(
        ", "
      )}`
    );
    error.code = "INVALID_FILE_TYPE";
    return cb(error, false);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

  if (!allowedExts.includes(ext)) {
    const error = new Error(
      `Invalid file extension. Allowed extensions: ${allowedExts.join(", ")}`
    );
    error.code = "INVALID_FILE_EXT";
    return cb(error, false);
  }

  cb(null, true);
};

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_CONFIG.uploadDir);
  },
  filename: (req, file, cb) => {
    const filename = generateFileName(file.originalname);
    req.generatedFilename = filename;
    cb(null, filename);
  },
});

// Multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_CONFIG.maxFileSize,
    files: 5,
  },
}).array("images", 5);

// Image processing function
const processImage = async (inputPath, outputPath, options = {}) => {
  const {
    width = UPLOAD_CONFIG.maxWidth,
    height = UPLOAD_CONFIG.maxHeight,
    quality = 85,
    format = "jpeg",
  } = options;

  try {
    let sharp_instance = sharp(inputPath);
    const metadata = await sharp_instance.metadata();

    if (metadata.width > width || metadata.height > height) {
      sharp_instance = sharp_instance.resize(width, height, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (format === "jpeg") {
      sharp_instance = sharp_instance.jpeg({ quality, progressive: true });
    } else if (format === "png") {
      sharp_instance = sharp_instance.png({ compressionLevel: 8 });
    } else if (format === "webp") {
      sharp_instance = sharp_instance.webp({ quality });
    }

    await sharp_instance.toFile(outputPath);

    return {
      success: true,
      originalSize: metadata.size,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.error("Image processing error:", error);
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

// Generate thumbnail
const generateThumbnail = async (inputPath, thumbnailPath) => {
  try {
    await sharp(inputPath)
      .resize(UPLOAD_CONFIG.thumbnailSize, UPLOAD_CONFIG.thumbnailSize, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    return { success: true };
  } catch (error) {
    console.error("Thumbnail generation error:", error);
    throw new Error(`Thumbnail generation failed: ${error.message}`);
  }
};

// Upload middleware with error handling
const uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);

      let message = "File upload failed";
      let statusCode = 400;

      if (err.code === "LIMIT_FILE_SIZE") {
        message = `File too large. Maximum size: ${
          UPLOAD_CONFIG.maxFileSize / 1024 / 1024
        }MB`;
      } else if (err.code === "LIMIT_FILE_COUNT") {
        message = "Too many files. Maximum 5 files allowed";
      } else if (err.code === "INVALID_FILE_TYPE") {
        message = err.message;
      } else if (err.code === "INVALID_FILE_EXT") {
        message = err.message;
      } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
        message = 'Unexpected field name. Use "images" field for file uploads';
      }

      return res.status(statusCode).json({
        success: false,
        message,
        code: err.code || "UPLOAD_ERROR",
        timestamp: new Date().toISOString(),
      });
    }

    next();
  });
};

// Main upload controller - Updated with your requirements

const uploadImages = async (req, res) => {
  try {
    console.log("🔧 Upload request received");
    console.log("🔧 Files:", req.files ? req.files.length : "No files");
    console.log("🔧 Body:", req.body);
    console.log("🔧 User:", req.user ? req.user.id : "No user");

    // Check if files exist
    if (!req.files || req.files.length === 0) {
      console.log("❌ No files in request");
      return res.status(400).json({
        success: false,
        message: "No images were uploaded. Please select at least one image.",
        code: "NO_FILES",
      });
    }

    // Get content from request body
    const { content = "", category = "general", tags = [] } = req.body;

    console.log("📝 Request data:", {
      content: content.substring(0, 50),
      category,
      tags: typeof tags === "string" ? JSON.parse(tags) : tags,
      filesCount: req.files.length,
    });

    const uploadResults = [];
    const errors = [];

    // Process each uploaded file
    for (const file of req.files) {
      try {
        console.log("📁 Processing file:", {
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          path: file.path,
        });

        const originalPath = file.path;
        const filename = file.filename;
        const nameWithoutExt = path.parse(filename).name;
        const processedFilename = `${nameWithoutExt}_processed.jpg`;
        const thumbnailFilename = `${nameWithoutExt}_thumb.jpg`;

        const processedPath = path.join(
          UPLOAD_CONFIG.uploadDir,
          processedFilename
        );
        const thumbnailPath = path.join(
          UPLOAD_CONFIG.thumbnailDir,
          thumbnailFilename
        );

        console.log("🔄 Processing paths:", {
          original: originalPath,
          processed: processedPath,
          thumbnail: thumbnailPath,
        });

        // Process main image
        const processResult = await processImage(originalPath, processedPath, {
          quality: 85,
          format: "jpeg",
        });

        console.log("✅ Image processed successfully");

        // Generate thumbnail
        await generateThumbnail(processedPath, thumbnailPath);
        console.log("✅ Thumbnail generated");

        // Delete original unprocessed file
        try {
          await fs.unlink(originalPath);
          console.log("🗑️ Original file cleaned up");
        } catch (unlinkError) {
          console.warn("Warning: Could not delete original file:", unlinkError);
        }

        // Get processed file stats
        const stats = await fs.stat(processedPath);

        // Build URLs
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const imageUrl = `${baseUrl}/uploads/images/${processedFilename}`;
        const thumbnailUrl = `${baseUrl}/uploads/thumbnails/${thumbnailFilename}`;

        // Prepare tags array
        let tagsArray = [];
        if (tags) {
          if (typeof tags === "string") {
            try {
              tagsArray = JSON.parse(tags);
            } catch (e) {
              tagsArray = tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean);
            }
          } else if (Array.isArray(tags)) {
            tagsArray = tags;
          }
        }

        console.log("💾 Creating database record...");

        // Create image record in database
        const imageData = new Image({
          filename: processedFilename,
          originalName: file.originalname,
          url: imageUrl,
          thumbnailUrl,
          createdBy: req.user.id,
          createdByName: req.user.name,
          createdByEmail: req.user.email,
          content: content.trim(),
          size: stats.size,
          dimensions: {
            width: processResult.width,
            height: processResult.height,
          },
          format: "jpeg",
          compressionRatio:
            (((file.size - stats.size) / file.size) * 100).toFixed(2) + "%",
          category,
          tags: tagsArray,
        });

        const savedImage = await imageData.save();
        console.log("✅ Database record created:", savedImage._id);

        const result = {
          success: true,
          id: savedImage._id,
          originalName: file.originalname,
          filename: processedFilename,
          url: imageUrl,
          thumbnailUrl,
          size: stats.size,
          processedSize: stats.size,
          originalSize: file.size,
          compressionRatio: imageData.compressionRatio,
          content: content.trim(),
          category,
          tags: imageData.tags,
          createdAt: savedImage.createdAt,
          uploadedBy: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
          },
          metadata: {
            ...processResult,
          },
        };

        uploadResults.push(result);
        console.log(
          `✅ Image processed and saved: ${filename} -> ${processedFilename}`
        );
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.filename}:`, fileError);
        console.error("Stack trace:", fileError.stack);

        // Clean up failed file
        try {
          if (file.path) {
            await fs.unlink(file.path);
          }
        } catch (cleanupError) {
          console.warn("Cleanup error:", cleanupError);
        }

        errors.push({
          filename: file.originalname,
          error: fileError.message,
        });
      }
    }

    // Update user's upload stats
    try {
      await User.findByIdAndUpdate(req.user.id, {
        $inc: {
          "stats.imagesUploaded": uploadResults.length,
          "stats.totalUploads": uploadResults.length,
        },
        "stats.lastActivity": new Date(),
      });
      console.log("✅ User stats updated");
    } catch (statsError) {
      console.warn("Warning: Could not update user stats:", statsError);
    }

    // Prepare response
    const response = {
      success: uploadResults.length > 0,
      message:
        uploadResults.length > 0
          ? `Successfully uploaded ${uploadResults.length} image(s)`
          : "No images were successfully processed",
      data: {
        images: uploadResults,
        totalProcessed: req.files.length,
        successful: uploadResults.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      },
      uploadedBy: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
      timestamp: new Date().toISOString(),
    };

    const statusCode =
      uploadResults.length > 0 ? (errors.length > 0 ? 207 : 201) : 400;

    console.log("🎉 Upload completed:", {
      successful: uploadResults.length,
      failed: errors.length,
      statusCode,
    });

    res.status(statusCode).json(response);
  } catch (error) {
    console.error("❌ Upload controller error:", error);
    console.error("Stack trace:", error.stack);

    // Enhanced error logging
    console.error("Error details:", {
      message: error.message,
      name: error.name,
      code: error.code,
      request: {
        files: req.files ? req.files.length : 0,
        body: Object.keys(req.body),
        user: req.user ? req.user.id : "none",
      },
    });

    // Clean up any uploaded files on error
    if (req.files) {
      req.files.forEach(async (file) => {
        try {
          if (file.path) {
            await fs.unlink(file.path);
            console.log("🧹 Cleaned up file:", file.path);
          }
        } catch (cleanupError) {
          console.warn("Cleanup error:", cleanupError);
        }
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error during image upload",
      code: "INTERNAL_ERROR",
      error:
        process.env.NODE_ENV === "development"
          ? {
              message: error.message,
              name: error.name,
              stack: error.stack?.substring(0, 500),
            }
          : undefined,
      timestamp: new Date().toISOString(),
    });
  }
};

// Get images with social features
const getImages = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      userId, // Optional: filter by specific user
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {
      isPublic: true,
      deletedAt: null,
      moderationStatus: "approved",
    };

    if (category) query.category = category;
    if (userId) query.createdBy = userId;
    if (search) {
      query.$or = [
        { content: { $regex: search, $options: "i" } },
        { originalName: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [images, totalCount] = await Promise.all([
      Image.find(query)
        .populate("createdBy", "name email referralCode avatar")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Image.countDocuments(query),
    ]);

    // Add user-specific data if authenticated
    let imagesWithUserData = images;
    if (req.user) {
      imagesWithUserData = await Promise.all(
        images.map(async (image) => {
          const isLiked = image.likes.some(
            (like) => like.user.toString() === req.user.id
          );
          const isFollowing = await Follow.isFollowing(
            req.user.id,
            image.createdBy._id
          );

          return {
            ...image,
            isLikedByUser: isLiked,
            isFollowingCreator: isFollowing,
            // Hide sensitive data
            likes: undefined,
            viewedBy: undefined,
          };
        })
      );
    }

    res.json({
      success: true,
      message: "Images retrieved successfully",
      data: {
        images: imagesWithUserData,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalImages: totalCount,
          hasMore: skip + images.length < totalCount,
          limit: parseInt(limit),
        },
        filters: {
          category,
          search,
          sortBy,
          sortOrder,
          userId,
        },
      },
    });
  } catch (error) {
    console.error("Get images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve images",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get user's uploaded images
const getUserImages = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { createdBy: req.user.id };

    if (category) query.category = category;
    if (search) {
      query.$or = [
        { content: { $regex: search, $options: "i" } },
        { originalName: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [images, totalCount] = await Promise.all([
      Image.find(query).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
      Image.countDocuments(query),
    ]);

    res.json({
      success: true,
      message: "Your images retrieved successfully",
      data: {
        images,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalImages: totalCount,
          hasMore: skip + images.length < totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Get user images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve images",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 🔥 FIXED: controllers/imageController.js - Like functionality
const toggleLike = async (req, res) => {
  try {
    const { imageId } = req.params;
    const userId = req.user.id;

    console.log(`💝 Like toggle request: User ${userId} on image ${imageId}`);

    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // 🔥 FIXED: Better like checking logic
    const likeIndex = image.likes.findIndex(
      (like) => like.user.toString() === userId.toString()
    );

    const wasLiked = likeIndex !== -1;

    if (wasLiked) {
      // Unlike: Remove the like
      image.likes.splice(likeIndex, 1);
      image.likeCount = image.likes.length;

      console.log(`💔 User unliked image. New count: ${image.likeCount}`);

      // Update user stats
      await User.findByIdAndUpdate(userId, {
        $inc: { "stats.postsLiked": -1 },
        "stats.lastActivity": new Date(),
      });

      await image.save();

      res.json({
        success: true,
        message: "Image unliked successfully",
        data: {
          action: "unliked",
          likeCount: image.likeCount,
          isLiked: false,
        },
      });
    } else {
      // Like: Add new like
      image.likes.push({
        user: userId,
        userName: req.user.name,
        likedAt: new Date(),
      });
      image.likeCount = image.likes.length;

      console.log(`❤️ User liked image. New count: ${image.likeCount}`);

      // Update user stats
      await User.findByIdAndUpdate(userId, {
        $inc: { "stats.postsLiked": 1 },
        "stats.lastActivity": new Date(),
      });

      await image.save();

      res.json({
        success: true,
        message: "Image liked successfully",
        data: {
          action: "liked",
          likeCount: image.likeCount,
          isLiked: true,
        },
      });
    }
  } catch (error) {
    console.error("❌ Toggle like error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to toggle like",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Add comment to image
const addComment = async (req, res) => {
  try {
    const { imageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    await image.addComment(req.user.id, req.user.name, req.user.email, content);

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { "stats.commentsPosted": 1 },
    });

    const newComment = image.comments[image.comments.length - 1];

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: {
        comment: {
          _id: newComment._id,
          content: newComment.content,
          user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
          },
          createdAt: newComment.createdAt,
          likeCount: newComment.likeCount,
        },
        commentCount: image.commentCount,
      },
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add comment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const addReplyToComment = async (req, res) => {
  try {
    const { imageId, commentId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Reply content is required",
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

    const reply = image.addReplyToComment(
      commentId,
      req.user.id,
      req.user.name,
      req.user.email,
      content
    );
    await image.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { "stats.commentsPosted": 1 },
      "stats.lastActivity": new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      data: { reply },
    });
  } catch (error) {
    console.error("Add reply error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add reply",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 🔥 FUNCTION: TOGGLE COMMENT LIKE (LIKE COMMENTS)
const toggleCommentLike = async (req, res) => {
  try {
    const { imageId, commentId } = req.params;

    const Image = require("../models/Image");
    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const result = image.toggleCommentLike(
      commentId,
      req.user.id,
      req.user.name
    );
    await image.save();

    res.json({
      success: true,
      message: `Comment ${result.action} successfully`,
      data: {
        action: result.action,
        likeCount: result.likeCount,
        isLiked: result.action === "liked",
      },
    });
  } catch (error) {
    console.error("Toggle comment like error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to toggle comment like",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 🔥 FUNCTION: TOGGLE REPLY LIKE (LIKE REPLIES)
const toggleReplyLike = async (req, res) => {
  try {
    const { imageId, commentId, replyId } = req.params;

    const Image = require("../models/Image");
    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const result = image.toggleReplyLike(
      commentId,
      replyId,
      req.user.id,
      req.user.name
    );
    await image.save();

    res.json({
      success: true,
      message: `Reply ${result.action} successfully`,
      data: {
        action: result.action,
        likeCount: result.likeCount,
        isLiked: result.action === "liked",
      },
    });
  } catch (error) {
    console.error("Toggle reply like error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to toggle reply like",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 🔥 FUNCTION: CREATE TEXT-ONLY POST
const createTextPost = async (req, res) => {
  try {
    const { content, category = "general", tags = [] } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Text content is required for text posts",
      });
    }

    const Image = require("../models/Image");
    const User = require("../models/User");

    // Create text post using existing Image model
    const textPost = new Image({
      filename: `text_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      originalName: "text_post",
      url: "", // Empty for text posts
      thumbnailUrl: "", // Empty for text posts
      size: 0, // Zero for text posts
      dimensions: { width: 0, height: 0 }, // Zero for text posts
      format: "text", // New format type for text posts
      createdBy: req.user.id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,
      content: content.trim(),
      category,
      tags: Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim()),
      postType: "text", // Add this field to differentiate
    });

    await textPost.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { "stats.totalUploads": 1 },
      "stats.lastActivity": new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Text post created successfully",
      data: { post: textPost },
    });
  } catch (error) {
    console.error("Create text post error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create text post",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete comment
const deleteComment = async (req, res) => {
  try {
    const { imageId, commentId } = req.params;

    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    await image.deleteComment(commentId, req.user.id);

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { "stats.commentsPosted": -1 },
    });

    res.json({
      success: true,
      message: "Comment deleted successfully",
      data: {
        commentCount: image.commentCount,
      },
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete comment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get image details with comments
const getImageDetails = async (req, res) => {
  try {
    const { imageId } = req.params;
    const userId = req.user ? req.user.id : null;

    const image = await Image.findById(imageId)
      .populate("createdBy", "name email referralCode avatar")
      .populate("comments.user", "name email avatar");

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Add view if user is authenticated and not the owner
    if (userId) {
      await image.addView(userId, req.ip);
    }

    // Check if user liked this image and is following creator
    let isLiked = false;
    let isFollowing = false;

    if (userId) {
      isLiked = image.likes.some((like) => like.user.toString() === userId);
      if (image.createdBy._id.toString() !== userId) {
        isFollowing = await Follow.isFollowing(userId, image.createdBy._id);
      }
    }

    const response = {
      ...image.toObject(),
      isLikedByUser: isLiked,
      isFollowingCreator: isFollowing,
      // Remove sensitive data
      likes: undefined,
      viewedBy: undefined,
    };

    res.json({
      success: true,
      message: "Image details retrieved successfully",
      data: {
        image: response,
      },
    });
  } catch (error) {
    console.error("Get image details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve image details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete image
const deleteImage = async (req, res) => {
  try {
    const { imageId } = req.params;

    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Check if user owns the image or is admin
    if (image.createdBy.toString() !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this image",
      });
    }

    // Delete physical files
    const imagePath = path.join(UPLOAD_CONFIG.uploadDir, image.filename);
    const thumbnailFilename = image.filename.replace("_processed.", "_thumb.");
    const thumbnailPath = path.join(
      UPLOAD_CONFIG.thumbnailDir,
      thumbnailFilename
    );

    const deletePromises = [];

    try {
      await fs.access(imagePath);
      deletePromises.push(fs.unlink(imagePath));
    } catch (error) {
      console.warn(`Image file not found: ${imagePath}`);
    }

    try {
      await fs.access(thumbnailPath);
      deletePromises.push(fs.unlink(thumbnailPath));
    } catch (error) {
      console.warn(`Thumbnail file not found: ${thumbnailPath}`);
    }

    await Promise.all(deletePromises);

    // Soft delete from database
    await image.softDelete(req.user.id);

    // Update user stats
    await User.findByIdAndUpdate(image.createdBy, {
      $inc: { "stats.imagesUploaded": -1 },
    });

    res.json({
      success: true,
      message: "Image deleted successfully",
      deletedImage: {
        id: image._id,
        filename: image.filename,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete image",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Utility function to format bytes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

module.exports = {
  uploadMiddleware,
  uploadImages,
  getImages,
  getUserImages,
  toggleLike,
  addComment,
  deleteComment,
  getImageDetails,
  deleteImage,
  createTextPost,
  toggleReplyLike,
  addReplyToComment,
  toggleCommentLike,
  UPLOAD_CONFIG,
};
