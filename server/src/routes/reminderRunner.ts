import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { queueDueReminders } from "../services/reminders.js";
import { sendQueuedEmails } from "../services/mail.js";
import { syncDueResults } from "../services/resultSync.js";

const router = Router();
let running = false;

export function validRunnerToken(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  if (!supplied) return false;
  const expectedHash = createHash("sha256").update(secret).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

router.post("/run", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!validRunnerToken(req.get("Authorization"), process.env.REMINDER_JOB_SECRET)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  if (running) return res.status(409).json({ success: false, error: "Reminder run already in progress" });
  running = true;
  try {
    const [mail, results] = await Promise.allSettled([
      (async () => { await queueDueReminders(); await sendQueuedEmails(); })(),
      syncDueResults(),
    ]);
    if (mail.status === "rejected") console.error("Reminder run failed:", mail.reason);
    if (results.status === "rejected") console.error("Result sync failed:", results.reason);
    if (mail.status === "rejected" || results.status === "rejected") {
      return res.status(500).json({ success: false, error: "Runner task failed" });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Reminder run failed:", error);
    return res.status(500).json({ success: false, error: "Reminder run failed" });
  } finally {
    running = false;
  }
});

export default router;
