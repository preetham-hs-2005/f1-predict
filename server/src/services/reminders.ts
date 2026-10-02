import { getDB } from "../utils/db.js";
import { queueEmail } from "./mail.js";
import { qualifyingEmail, raceWeekEmail } from "./emailTemplates.js";
import type { UserDocument } from "../models/User.js";
import type { ObjectId } from "mongodb";
import { appUrl } from "../utils/appUrl.js";

export interface Race {
  raceId: string;
  raceName: string;
  circuitName: string;
  qualifyingStartTime?: string;
  sprintQualifyingStartTime?: string | null;
  raceStartTime?: string;
  timeZone?: string;
  sprintWeekend?: boolean;
  cancelled?: boolean;
  isComplete?: boolean;
}

export interface NotificationDocument {
  _id?: ObjectId;
  key: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  createdAt: Date;
  readAt?: Date;
}

const calendarDate = (date: Date, timeZone: string) => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  }
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const validDate = (value?: string | null) => {
  // Reminder times must be absolute; an offset-free value depends on the worker's local time zone.
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function mondaySendAt(raceStart: Date, raceTimeZone = "Asia/Kolkata"): Date {
  const [year, month, day] = calendarDate(raceStart, raceTimeZone).split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (utcDay.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month - 1, day - daysSinceMonday, 3, 30));
}

export function dueQualifyingSessions(race: Race, now: Date) {
  return ([
    { type: "race", label: "Grand Prix qualifying", start: validDate(race.qualifyingStartTime) },
    ...(race.sprintWeekend ? [{ type: "sprint", label: "Sprint qualifying", start: validDate(race.sprintQualifyingStartTime) }] : []),
  ]).filter((session) => session.start && now >= new Date(session.start.getTime() - 60 * 60_000) && now < new Date(session.start.getTime() - 58 * 60_000));
}

export async function queueDueReminders(now = new Date()): Promise<void> {
  const db = getDB();
  const races = await db.collection<Race>("races").find({ cancelled: { $ne: true }, isComplete: { $ne: true } }).toArray();
  for (const race of races) {
    const raceStart = validDate(race.raceStartTime);
    if (!raceStart || raceStart <= now) continue;
    const monday = raceStart && mondaySendAt(raceStart, race.timeZone);
    const mondayDue = monday && now >= monday && now < new Date(monday.getTime() + 15 * 60 * 60_000) && now < raceStart!;
    const sessions = dueQualifyingSessions(race, now);
    if (!mondayDue && sessions.length === 0) continue;

    for await (const user of db.collection<UserDocument>("users").find({}, { projection: { _id: 1, email: 1, name: 1 } })) {
      if (!user._id || !user.email) continue;
      const id = user._id.toString();
      if (mondayDue) {
        const date = (value?: string | null) => validDate(value)?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" }) || "To be confirmed";
        await queueEmail({
          key: `monday:${race.raceId}:${id}`,
          expiresAt: new Date(monday!.getTime() + 15 * 60 * 60_000),
          to: user.email,
          subject: `Race week: ${race.raceName}`,
          ...raceWeekEmail(user.name, race.raceName, race.circuitName, [
            ...(race.sprintWeekend ? [{ label: "Sprint qualifying", value: date(race.sprintQualifyingStartTime) }] : []),
            { label: "Grand Prix qualifying", value: date(race.qualifyingStartTime) },
            { label: "Race", value: date(race.raceStartTime) },
          ], `${appUrl()}/dashboard`),
        });
      }
      for (const session of sessions) {
        const key = `qualifying:${race.raceId}:${session.type}:${id}`;
        const url = `/predict/${encodeURIComponent(race.raceId)}/${session.type}`;
        const body = `${race.raceName} ${session.label} starts in one hour. Make your prediction before the window closes.`;
        await db.collection<NotificationDocument>("notifications").updateOne(
          { key },
          { $setOnInsert: { key, userId: id, title: "Prediction deadline approaching", body, url, createdAt: now } },
          { upsert: true },
        );
        await queueEmail({ key, to: user.email, subject: `One hour until ${session.label}: ${race.raceName}`, ...qualifyingEmail(user.name, race.raceName, session.label, session.start!.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" }), `${appUrl()}${url}`), expiresAt: session.start! });
      }
    }
  }
}
