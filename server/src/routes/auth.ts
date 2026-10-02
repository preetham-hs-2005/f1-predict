import { Router, Request, Response } from "express";
import { User } from "../models/User.js";
import { generateToken } from "../utils/jwt.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { createHash, randomBytes } from "crypto";
import { queueEmail, sendDirectEmail } from "../services/mail.js";
import { resetEmail, welcomeEmail } from "../services/emailTemplates.js";
import { appUrl } from "../utils/appUrl.js";

const router = Router();
const authLimiter = rateLimiter(15 * 60 * 1000, 50); // max 50 requests per 15 mins per IP
const resetLimiter = rateLimiter(15 * 60 * 1000, 5);
const resetTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// POST /api/auth/register
router.post("/register", authLimiter, async (req: Request, res: Response) => {
  try {
    const { name, email, password, username } = req.body;

    if (!name || !email || !password || !username) {
      return res.status(400).json({
        success: false,
        error: "Name, username, email, and password are required",
      });
    }

    // Trim fields
    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedPassword = String(password);
    const trimmedUsername = String(username).trim();

    if (!trimmedName || !trimmedEmail || !trimmedPassword || !trimmedUsername) {
      return res.status(400).json({
        success: false,
        error: "Name, username, email, and password cannot be empty",
      });
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({
        success: false,
        error: "Username must be 3-20 characters",
      });
    }
    
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return res.status(400).json({
        success: false,
        error: "Username can only contain letters, numbers, underscores, and hyphens",
      });
    }

    if (trimmedPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters",
      });
    }

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Name must be 2-50 characters",
      });
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address",
      });
    }

    const user = await User.create(trimmedName, trimmedEmail, trimmedPassword, trimmedUsername);
    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    try {
      await queueEmail({ key: `welcome:${user._id}`, to: user.email, subject: "Welcome to F1 Predictor Pro", ...welcomeEmail(user.name, `${appUrl()}/dashboard`) });
    } catch (error) {
      console.error("Welcome email queue failed:", error);
    }
    res.status(201).json({
      success: true,
      user: User.formatResponse(user),
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    console.error("Registration error:", message);
    res.status(400).json({ success: false, error: message });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const validPassword = await User.verifyPassword(user, password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    res.json({
      success: true,
      user: User.formatResponse(user),
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(500).json({ success: false, error: message });
  }
});

// The same response is used for known and unknown addresses to avoid account enumeration.
router.post("/forgot-password", resetLimiter, async (req: Request, res: Response) => {
  const response = { success: true, message: "If an account exists for that email, a reset link has been sent." };
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || email.length > 320) return res.status(400).json({ success: false, error: "Enter a valid email address" });
    const user = await User.findByEmail(email);
    if (user?._id) {
      const token = randomBytes(32).toString("hex");
      await User.setResetToken(user._id, resetTokenHash(token), new Date(Date.now() + 30 * 60_000));
      const url = `${appUrl()}/reset-password?token=${token}`;
      await sendDirectEmail(user.email, "Reset your F1 Predictor Pro password", resetEmail(user.name, url));
    }
  } catch (error) {
    console.error("Password reset request failed:", error);
  }
  return res.json(response);
});

router.post("/reset-password", resetLimiter, async (req: Request, res: Response) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  if (!/^[a-f0-9]{64}$/.test(token) || password.length < 8 || password.length > 128) {
    return res.status(400).json({ success: false, error: "Invalid link or password. Password must be 8–128 characters." });
  }
  try {
    const changed = await User.resetPassword(resetTokenHash(token), password);
    if (!changed) return res.status(400).json({ success: false, error: "This reset link is invalid or has expired." });
    return res.json({ success: true });
  } catch (error) {
    console.error("Password reset failed:", error);
    return res.status(500).json({ success: false, error: "Password reset failed. Please try again." });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      user: User.formatResponse(user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch user";
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/auth/username
router.put("/username", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { username } = req.body;
    const trimmedUsername = String(username || "").trim();

    if (!trimmedUsername) {
      return res.status(400).json({ success: false, error: "Username is required" });
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({ success: false, error: "Username must be 3-20 characters" });
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return res.status(400).json({
        success: false,
        error: "Username can only contain letters, numbers, underscores, and hyphens",
      });
    }

    const user = await User.updateUsername(req.user.userId, trimmedUsername);
    if (!user) {
       return res.status(404).json({ success: false, error: "User not found" });
    }

    // Generate fresh token with username included
    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    res.json({
      success: true,
      user: User.formatResponse(user),
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set username";
    res.status(400).json({ success: false, error: message });
  }
});

// PUT /api/auth/profile
router.put("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { name } = req.body;
    const trimmedName = String(name || "").trim();

    if (!trimmedName) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({ success: false, error: "Name must be 2-50 characters" });
    }

    const user = await User.updateName(req.user.userId, trimmedName);
    if (!user) {
       return res.status(404).json({ success: false, error: "User not found" });
    }

    // Generate fresh token with updated name
    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    res.json({
      success: true,
      user: User.formatResponse(user),
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update profile name";
    res.status(400).json({ success: false, error: message });
  }
});

// POST /api/auth/logout
router.post("/logout", authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logout failed";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
