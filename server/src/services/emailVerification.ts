import { createHmac, randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { User, type UserDocument } from "../models/User.js";
import { getDB } from "../utils/db.js";
import { sendDirectEmail } from "./mail.js";
import { emailVerificationEmail } from "./emailTemplates.js";
import { appUrl } from "../utils/appUrl.js";

const CODE_LIFETIME_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const WINDOW_MS = 60 * 60_000;
const HOURLY_LIMIT = 5;
const MAX_ATTEMPTS = 5;

export class VerificationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function codeHash(userId: string, code: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

export function verificationLimit(user: UserDocument, now: Date): string | null {
  if (user.emailVerifiedAt) return "Email is already verified.";
  if (user.verificationLastSentAt && now.getTime() - user.verificationLastSentAt.getTime() < COOLDOWN_MS) return "Please wait 60 seconds before requesting another code.";
  if (user.verificationWindowStart && now.getTime() - user.verificationWindowStart.getTime() < WINDOW_MS && (user.verificationSentCount || 0) >= HOURLY_LIMIT) return "Too many codes requested. Try again in an hour.";
  return null;
}

export function verificationCodeFailure(user: UserDocument | null, now: Date): string {
  if (user?.emailVerifiedAt) return "This code was already used.";
  if (!user?.verificationCodeHash || !user.verificationExpiresAt || user.verificationExpiresAt <= now) return "This code has expired or was cancelled. Request a new code.";
  if ((user.verificationAttempts || 0) >= MAX_ATTEMPTS) return "Too many attempts. Request a new code.";
  return "Incorrect code. Please try again.";
}

export async function sendVerificationCode(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user?._id) throw new VerificationError("Account not found.", 404);
  const now = new Date();
  const limit = verificationLimit(user, now);
  if (limit) throw new VerificationError(limit, 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const hash = codeHash(userId, code);
  const activeWindow = Boolean(user.verificationWindowStart && now.getTime() - user.verificationWindowStart.getTime() < WINDOW_MS);
  const users = getDB().collection<UserDocument>("users");
  const reserved = await users.updateOne(
    {
      _id: user._id,
      email: user.email,
      emailVerifiedAt: { $exists: false },
      verificationLastSentAt: user.verificationLastSentAt || { $exists: false },
      verificationSentCount: user.verificationSentCount ?? { $exists: false },
    },
    { $set: {
      verificationCodeHash: hash,
      verificationExpiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
      verificationAttempts: 0,
      verificationLastSentAt: now,
      verificationWindowStart: activeWindow ? user.verificationWindowStart! : now,
      verificationSentCount: activeWindow ? (user.verificationSentCount || 0) + 1 : 1,
      updatedAt: now,
    } },
  );
  if (!reserved.modifiedCount) throw new VerificationError("Please try again.", 409);

  try {
    await sendDirectEmail(user.email, "Verify your F1 Predictor Pro email", emailVerificationEmail(user.name, code, `${appUrl()}/dashboard`));
  } catch (error) {
    await users.updateOne({ _id: user._id, verificationCodeHash: hash }, {
      $unset: { verificationCodeHash: "", verificationExpiresAt: "", verificationLastSentAt: "" },
      $set: { verificationSentCount: activeWindow ? (user.verificationSentCount || 0) : 0 },
    });
    console.error("Verification email delivery failed:", error);
    throw new VerificationError("We could not send the code. Please try again.", 503);
  }
}

export async function verifyEmailCode(userId: string, code: string): Promise<UserDocument> {
  if (!/^\d{6}$/.test(code)) throw new VerificationError("Enter the six-digit code.");
  const id = new ObjectId(userId);
  const users = getDB().collection<UserDocument>("users");
  const now = new Date();
  const verified = await users.findOneAndUpdate(
    { _id: id, emailVerifiedAt: { $exists: false }, verificationCodeHash: codeHash(userId, code), verificationExpiresAt: { $gt: now }, verificationAttempts: { $lt: MAX_ATTEMPTS } },
    { $set: { emailVerifiedAt: now, updatedAt: now }, $unset: { verificationCodeHash: "", verificationExpiresAt: "", verificationAttempts: "", verificationLastSentAt: "" } },
    { returnDocument: "after" },
  );
  if (verified) return verified;

  const active = await users.findOneAndUpdate(
    { _id: id, emailVerifiedAt: { $exists: false }, verificationCodeHash: { $exists: true }, verificationExpiresAt: { $gt: now }, verificationAttempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { verificationAttempts: 1 } },
    { returnDocument: "after" },
  );
  if (active) throw new VerificationError(verificationCodeFailure(active, now));
  throw new VerificationError(verificationCodeFailure(await users.findOne({ _id: id }), now));
}
