import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  username?: string;
  role: "user" | "admin";
  tokenVersion?: number;
}

export function generateToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not set");
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}
