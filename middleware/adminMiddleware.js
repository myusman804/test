// Admin utility function
const checkIsAdmin = (email) => {
  if (!email || typeof email !== "string") {
    return false;
  }

  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((email) =>
        email.trim().toLowerCase()
      )
    : [];

  return adminEmails.includes(email.toLowerCase());
};

// Enhanced admin logging
const logAdminAccess = (req, action, success = true) => {
  const logData = {
    timestamp: new Date().toISOString(),
    action,
    success,
    user: {
      id: req.user?.id,
      email: req.user?.email,
      name: req.user?.name,
    },
    request: {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
      path: req.originalUrl,
      method: req.method,
    },
  };

  if (success) {
    console.log(
      `🔐 Admin Access: ${action} - ${req.user?.email || "Unknown"}`,
      logData
    );
  } else {
    console.warn(
      `⚠️  Admin Access Denied: ${action} - ${req.user?.email || "Unknown"}`,
      logData
    );
  }
};

// Middleware to require admin privileges
const requireAdmin = (req, res, next) => {
  try {
    // Check if user is authenticated first
    if (!req.user) {
      logAdminAccess(req, "Admin access attempt without authentication", false);
      return res.status(401).json({
        success: false,
        message: "Authentication required for admin access",
        code: "AUTH_REQUIRED",
      });
    }

    // Double-check admin status against environment variable
    const isAdminByEmail = checkIsAdmin(req.user.email);
    const isAdminByToken = req.user.is_admin;

    // User must be admin both by token AND by current environment config
    if (!isAdminByEmail || !isAdminByToken) {
      logAdminAccess(
        req,
        "Admin access denied - insufficient privileges",
        false
      );

      return res.status(403).json({
        success: false,
        message: "Administrator privileges required for this action",
        code: "ADMIN_REQUIRED",
        details: {
          tokenAdmin: !!isAdminByToken,
          configAdmin: !!isAdminByEmail,
          requiresBoth: true,
        },
      });
    }

    // Log successful admin access
    logAdminAccess(
      req,
      `Admin access granted - ${req.method} ${req.path}`,
      true
    );

    // Add admin confirmation to request object
    req.user.adminConfirmed = true;
    req.user.adminAccessTime = new Date();

    next();
  } catch (error) {
    console.error("❌ Admin middleware error:", error);
    logAdminAccess(req, "Admin middleware error", false);

    return res.status(500).json({
      success: false,
      message: "Error checking administrator permissions",
      code: "ADMIN_CHECK_ERROR",
    });
  }
};

// Middleware to optionally check admin status (doesn't block non-admins)
const checkAdminStatus = (req, res, next) => {
  try {
    if (req.user && req.user.email) {
      const isAdminByEmail = checkIsAdmin(req.user.email);
      const isAdminByToken = req.user.is_admin || false;

      // Update admin status based on both token and current config
      req.user.is_admin = isAdminByEmail && isAdminByToken;
      req.user.adminConfirmed = req.user.is_admin;
      req.user.adminDetails = {
        byEmail: isAdminByEmail,
        byToken: isAdminByToken,
        final: req.user.is_admin,
      };

      if (req.user.is_admin) {
        console.log(`👑 Admin user detected: ${req.user.email}`);
      }
    }
    next();
  } catch (error) {
    console.error("❌ Admin status check error:", error);
    // Continue even if admin check fails - this is optional middleware
    next();
  }
};

// Middleware for super admin actions (extra sensitive operations)
const requireSuperAdmin = (req, res, next) => {
  try {
    // First check regular admin requirements
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }

    // Check if user is regular admin first
    const isAdminByEmail = checkIsAdmin(req.user.email);
    const isAdminByToken = req.user.is_admin;

    if (!isAdminByEmail || !isAdminByToken) {
      return res.status(403).json({
        success: false,
        message: "Administrator privileges required",
        code: "ADMIN_REQUIRED",
      });
    }

    // Additional super admin checks (you can customize this logic)
    const superAdminEmails = process.env.SUPER_ADMIN_EMAILS
      ? process.env.SUPER_ADMIN_EMAILS.split(",").map((email) =>
          email.trim().toLowerCase()
        )
      : [];

    const isSuperAdmin =
      superAdminEmails.length === 0 ||
      superAdminEmails.includes(req.user.email.toLowerCase());

    if (!isSuperAdmin) {
      logAdminAccess(req, "Super admin access denied", false);
      return res.status(403).json({
        success: false,
        message: "Super administrator privileges required for this action",
        code: "SUPER_ADMIN_REQUIRED",
      });
    }

    logAdminAccess(
      req,
      `Super admin access granted - ${req.method} ${req.path}`,
      true
    );

    req.user.superAdminConfirmed = true;
    req.user.superAdminAccessTime = new Date();

    next();
  } catch (error) {
    console.error("❌ Super admin middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking super administrator permissions",
      code: "SUPER_ADMIN_CHECK_ERROR",
    });
  }
};

// Helper function to validate admin email format
const validateAdminEmail = (email) => {
  if (!email || typeof email !== "string") {
    return { valid: false, reason: "Email must be a non-empty string" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: "Invalid email format" };
  }

  return { valid: true };
};

// Function to add admin email (for programmatic admin management)
const addAdminEmail = (email) => {
  const validation = validateAdminEmail(email);
  if (!validation.valid) {
    return { success: false, message: validation.reason };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const currentAdmins = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];

  if (currentAdmins.includes(normalizedEmail)) {
    return { success: false, message: "Email is already an admin" };
  }

  // Note: This doesn't permanently update the environment variable
  // You'd need to implement persistent storage for production use
  currentAdmins.push(normalizedEmail);
  process.env.ADMIN_EMAILS = currentAdmins.join(",");

  console.log(`✅ Admin email added: ${normalizedEmail}`);
  return { success: true, message: "Admin email added successfully" };
};

// Function to remove admin email
const removeAdminEmail = (email) => {
  const validation = validateAdminEmail(email);
  if (!validation.valid) {
    return { success: false, message: validation.reason };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const currentAdmins = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];

  const index = currentAdmins.indexOf(normalizedEmail);
  if (index === -1) {
    return { success: false, message: "Email is not an admin" };
  }

  currentAdmins.splice(index, 1);
  process.env.ADMIN_EMAILS = currentAdmins.join(",");

  console.log(`🗑️  Admin email removed: ${normalizedEmail}`);
  return { success: true, message: "Admin email removed successfully" };
};

// Function to list all admin emails
const listAdminEmails = () => {
  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((email) =>
        email.trim().toLowerCase()
      )
    : [];

  return {
    success: true,
    count: adminEmails.length,
    emails: adminEmails,
    message: `Found ${adminEmails.length} admin email(s)`,
  };
};

module.exports = {
  requireAdmin,
  checkAdminStatus,
  requireSuperAdmin,
  checkIsAdmin,
  addAdminEmail,
  removeAdminEmail,
  listAdminEmails,
  validateAdminEmail,
  logAdminAccess,
};
