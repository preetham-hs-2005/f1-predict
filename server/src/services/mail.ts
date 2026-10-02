import nodemailer from "nodemailer";
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

function smtpTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM are required for mail delivery");
  }
  return { transport: nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } }), from: SMTP_FROM };
}

export async function sendDirectEmail(to: string, subject: string, content: EmailContent): Promise<void> {
  const { transport, from } = smtpTransport();
  await transport.sendMail({ from, to, subject, ...content });
}

export async function queueEmail(input: Pick<MailJob, "key" | "to" | "subject" | "text" | "html"> & { expiresAt?: Date }): Promise<void> {
  await getDB().collection<MailJob>("mailJobs").updateOne(
    { key: input.key },
    { $setOnInsert: { ...input, status: "pending", attempts: 0, nextAttemptAt: new Date() } },
    { upsert: true },
  );
}

export async function sendQueuedEmails(limit = 50): Promise<void> {
  const { transport, from } = smtpTransport();
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
      await transport.sendMail({ from, to: job.to, subject: job.subject, text: job.text, html: job.html });
      await jobs.updateOne({ key: job.key }, { $set: { status: "sent", sentAt: new Date() }, $unset: { leaseUntil: "", lastError: "" } });
    } catch (error) {
      const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 10));
      await jobs.updateOne({ key: job.key }, { $set: { status: "pending", nextAttemptAt: new Date(Date.now() + delay), lastError: String(error) }, $unset: { leaseUntil: "" } });
      console.error(`Email delivery failed for ${job.key}:`, error);
    }
  }
}
