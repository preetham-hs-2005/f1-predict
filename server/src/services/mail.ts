import { createHash } from "node:crypto";
import { getDB } from "../utils/db.js";
import type { EmailContent } from "./emailTemplates.js";

interface MailJob {
  key: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  status: "pending" | "sending" | "sent" | "expired";
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  sentAt?: Date;
  lastError?: string;
  expiresAt?: Date;
}

async function sendWithResend(to: string, subject: string, content: { text: string; html?: string }, idempotencyKey?: string): Promise<void> {
  // SMTP ports are blocked on Render's Free instances. Resend's HTTPS API uses the same sending key.
  const key = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY (or SMTP_PASS) and SMTP_FROM are required for mail delivery");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, to: [to], subject, text: content.text, html: content.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { name?: string } | null;
    throw new Error(`Resend API rejected email: HTTP ${response.status}${error?.name ? ` (${error.name})` : ""}`);
  }
}

export async function sendDirectEmail(to: string, subject: string, content: EmailContent): Promise<void> {
  await sendWithResend(to, subject, content);
}

export async function queueEmail(input: Pick<MailJob, "key" | "to" | "subject" | "text" | "html"> & { expiresAt?: Date }): Promise<void> {
  await getDB().collection<MailJob>("mailJobs").updateOne(
    { key: input.key },
    { $setOnInsert: { ...input, status: "pending", attempts: 0, nextAttemptAt: new Date() } },
    { upsert: true },
  );
}

export async function sendQueuedEmails(limit = 50): Promise<void> {
  const jobs = getDB().collection<MailJob>("mailJobs");
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const job = await jobs.findOneAndUpdate(
      { $or: [{ status: "pending", nextAttemptAt: { $lte: now } }, { status: "sending", leaseUntil: { $lte: now } }] },
      { $set: { status: "sending", leaseUntil: new Date(now.getTime() + 5 * 60_000) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
    );
    if (!job) break;
    if (job.expiresAt && now >= job.expiresAt) {
      await jobs.updateOne({ key: job.key }, { $set: { status: "expired", lastError: "Skipped after deadline" }, $unset: { leaseUntil: "" } });
      continue;
    }
    try {
      await sendWithResend(job.to, job.subject, { text: job.text, html: job.html }, createHash("sha256").update(job.key).digest("hex"));
      await jobs.updateOne({ key: job.key }, { $set: { status: "sent", sentAt: new Date() }, $unset: { leaseUntil: "", lastError: "" } });
    } catch (error) {
      const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 10));
      await jobs.updateOne({ key: job.key }, { $set: { status: "pending", nextAttemptAt: new Date(Date.now() + delay), lastError: String(error) }, $unset: { leaseUntil: "" } });
      console.error(`Email delivery failed for ${job.key}:`, error);
    }
  }
}
