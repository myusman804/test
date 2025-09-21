// Enhanced upload middleware with better error handling
const uploadMiddlewareEnhanced = (req, res, next) => {
  console.log("🔧 Upload middleware starting...");
  console.log("🔧 Content-Type:", req.headers["content-type"]);
  console.log("🔧 Content-Length:", req.headers["content-length"]);

  upload(req, res, (err) => {
    if (err) {
      console.error("❌ Multer upload error:", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        field: err.field,
        storageErrors: err.storageErrors,
      });

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
      } else if (err.message && err.message.includes("ENOENT")) {
        message =
          "Upload directory not accessible. Server configuration error.";
        statusCode = 500;
      }

      return res.status(statusCode).json({
        success: false,
        message,
        code: err.code || "UPLOAD_ERROR",
        timestamp: new Date().toISOString(),
      });
    }

    console.log("✅ Multer upload successful");
    console.log("📁 Files received:", req.files ? req.files.length : 0);
    if (req.files) {
      req.files.forEach((file, index) => {
        console.log(`📄 File ${index + 1}:`, {
          originalname: file.originalname,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
        });
      });
    }

    next();
  });
};

// Make sure your upload directories exist
const ensureUploadDirectories = async () => {
  try {
    const fs = require("fs").promises;
    await fs.mkdir("uploads", { recursive: true });
    await fs.mkdir("uploads/images", { recursive: true });
    await fs.mkdir("uploads/thumbnails", { recursive: true });
    console.log("✅ Upload directories ensured");
  } catch (error) {
    console.error("❌ Failed to create upload directories:", error);
    throw error;
  }
};

// Call this when your server starts
ensureUploadDirectories().catch(console.error);
