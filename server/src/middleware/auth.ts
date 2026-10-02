import { Request, Response, NextFunction } from "express";
import { extractToken, verifyToken, JwtPayload } from "../utils/jwt.js";
import { User } from "../models/User.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ success: false, error: "Missing authentication token" });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }

    const user = await User.findById(payload.userId);
    if (!user || (user.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
      return res.status(401).json({ success: false, error: "Session expired. Please sign in again." });
    }

    req.user = { ...payload, role: user.role };
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: "Authentication failed" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}

export async function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user && await User.findById(req.user.userId);
    if (!user?.emailVerifiedAt) {
      return res.status(403).json({ success: false, error: "Verify your email before making predictions." });
    }
    next();
  } catch (error) {
    console.error("Email verification check failed:", error);
    return res.status(503).json({ success: false, error: "Could not confirm email verification. Please try again." });
  }
}
