import dotenv from "dotenv";
import dns from "dns";
import { createHash, randomBytes } from "crypto";
import { connectDB, closeDB } from "../utils/db.js";
import { User } from "../models/User.js";
import { appUrl } from "../utils/appUrl.js";
import { sendDirectEmail } from "../services/mail.js";
import { previewEmail, qualifyingEmail, raceWeekEmail, resetEmail, welcomeEmail } from "../services/emailTemplates.js";
import type { Race } from "../services/reminders.js";

dotenv.config();
// Windows may expose only a local resolver that refuses MongoDB Atlas SRV queries.
dns.setServers((process.env.DNS_SERVERS || "1.1.1.1,8.8.8.8").split(",").map((server) => server.trim()).filter(Boolean));

const recipient = process.argv[2]?.trim().toLowerCase();
const skipReset = process.argv.includes("--skip-reset");
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  throw new Error("Usage: npm run preview:emails -- recipient@example.com");
}

const inIndia = (value?: string | null) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" })
  : "To be confirmed";

async function main() {
try {
  const db = await connectDB();
  const user = await User.findByEmail(recipient);
  if (!user?._id) throw new Error("That address is not a registered user. No preview emails were sent.");

  const races = await db.collection<Race>("races").find({ cancelled: { $ne: true }, isComplete: { $ne: true }, raceStartTime: { $gt: new Date().toISOString() } }).sort({ raceStartTime: 1 }).toArray();
  const hasZone = (value?: string | null) => Boolean(value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value));
  const nextRace = races.find((race) => hasZone(race.raceStartTime) && hasZone(race.qualifyingStartTime));
  const sprintRace = races.find((race) => hasZone(race.raceStartTime) && race.sprintWeekend && hasZone(race.sprintQualifyingStartTime));
  if (!nextRace || !sprintRace) throw new Error("Upcoming Grand Prix and sprint race data are required. No preview emails were sent.");

  const base = appUrl();
  const sendPreview = async (subject: string, content: ReturnType<typeof welcomeEmail>) => {
    await sendDirectEmail(user.email, `[Preview] ${subject}`, previewEmail(content));
    console.log(`Sent: ${subject}`);
  };

  await sendPreview("Welcome to F1 Predictor Pro", welcomeEmail(user.name, `${base}/dashboard`));
  await sendPreview(`Race week: ${nextRace.raceName}`, raceWeekEmail(user.name, nextRace.raceName, nextRace.circuitName, [
    ...(nextRace.sprintWeekend ? [{ label: "Sprint qualifying", value: inIndia(nextRace.sprintQualifyingStartTime) }] : []),
    { label: "Grand Prix qualifying", value: inIndia(nextRace.qualifyingStartTime) },
    { label: "Race", value: inIndia(nextRace.raceStartTime) },
  ], `${base}/dashboard`));
  await sendPreview(`One hour until Grand Prix qualifying: ${nextRace.raceName}`, qualifyingEmail(user.name, nextRace.raceName, "Grand Prix qualifying", inIndia(nextRace.qualifyingStartTime), `${base}/predict/${encodeURIComponent(nextRace.raceId)}/race`));
  await sendPreview(`One hour until Sprint qualifying: ${sprintRace.raceName}`, qualifyingEmail(user.name, sprintRace.raceName, "Sprint qualifying", inIndia(sprintRace.sprintQualifyingStartTime), `${base}/predict/${encodeURIComponent(sprintRace.raceId)}/sprint`));

  if (!skipReset) {
    // This last message is a real, single-use reset link and replaces any earlier reset link.
    const token = randomBytes(32).toString("hex");
    await User.setResetToken(user._id, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 30 * 60_000));
    await sendDirectEmail(user.email, "Reset your F1 Predictor Pro password", resetEmail(user.name, `${base}/reset-password?token=${token}`));
    console.log("Sent: password reset (real, expires in 30 minutes; previous reset links are invalid)");
  }
} finally {
  await closeDB();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
