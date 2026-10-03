import { createHash } from "node:crypto";
import { getDB } from "../utils/db.js";
import { scoreStoredResult, type StoredResult } from "./resultScoring.js";
import { absoluteSessionDate } from "../utils/raceTime.js";

const BASE = "https://api.jolpi.ca/f1/alpha";
type Kind = "race" | "sprint";
interface Race { raceId: string; raceName: string; circuitName?: string; raceStartTime?: string; qualifyingStartTime?: string; sprintQualifyingStartTime?: string; sprintWeekend?: boolean; cancelled?: boolean; jolpicaRoundId?: string }
interface ScheduleEvent { round: { id: string; number?: number | null; name: string; is_cancelled: boolean }; circuit: { name: string; country_flag?: string }; schedule: { code: string; timestamp: string }[] }
interface Entry { driver: { abbreviation: string; permanent_car_number?: number }; team: { name: string }; position: number | null; is_classified: boolean; points?: number }
interface FeedResult { data?: { code: string; results: Entry[]; round: { id: string }; timestamp: string } }
const clean = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => clean(s).split(" ").filter((x) => x.length > 3 && !["grand", "prix", "circuit", "international", "autodromo", "street", "raceway"].includes(x));
// 2026 has two Spanish events. These aliases identify the venue as well as the name.
const feedAliases: Record<string, { name: string; circuit: string; localCircuits: string[] }> = {
  "spain-2026": { name: "Barcelona Grand Prix", circuit: "Circuit de Barcelona-Catalunya", localCircuits: ["Circuit de Barcelona-Catalunya"] },
  "madrid-2026": { name: "Spanish Grand Prix", circuit: "Madring", localCircuits: ["Madrid Circuit", "Madring"] },
  "brazil-2026": { name: "Brazilian Grand Prix", circuit: "Autódromo José Carlos Pace", localCircuits: ["Interlagos Circuit", "Autódromo José Carlos Pace"] },
  "qatar-2026": { name: "Qatar Grand Prix", circuit: "Lusail International Circuit", localCircuits: ["Losail International Circuit", "Lusail International Circuit"] },
};

export function matchEvent(race: Race, events: ScheduleEvent[]): ScheduleEvent | null {
  const date = absoluteSessionDate(race.raceStartTime);
  const alias = feedAliases[race.raceId];
  // Only the verified 2026 Malaysia replacement may use a nonstandard race name.
  if (!date || race.cancelled || (!/grand prix$/i.test(race.raceName.trim()) &&
    !(race.raceId === "bahrain-2026" && race.raceName === "Bahrain Grand Prix in Malaysia"))) return null;
  if (alias && !alias.localCircuits.some((circuit) => clean(circuit) === clean(race.circuitName || ""))) return null;
  const matches = events.filter((event) => {
    if (event.round.is_cancelled || clean(event.round.name) !== clean(alias?.name || race.raceName)) return false;
    const start = event.schedule.find((s) => s.code === "R")?.timestamp;
    if (!start || Math.abs(new Date(start).getTime() - date.getTime()) > 36 * 60 * 60_000) return false;
    if (alias && clean(event.circuit.name) !== clean(alias.circuit)) return false;
    const localTokens = tokens(alias?.circuit || race.circuitName || "");
    const remoteTokens = tokens(event.circuit.name);
    return localTokens.some((t) => remoteTokens.includes(t)) || localTokens.length === 0;
  });
  return matches.length === 1 ? matches[0] : null;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": "F1PredictorPro/1.0 (https://f1predict.dev)" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Jolpica HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function topConstructor(entries: Entry[], teamForDriver: (entry: Entry) => string | undefined): string | null {
  const teams = new Map<string, { points: number; bestFinish: number }>();
  for (const entry of entries) {
    const team = teamForDriver(entry);
    if (!team || typeof entry.points !== "number" || !Number.isFinite(entry.points)) return null;
    const previous = teams.get(team) || { points: 0, bestFinish: Infinity };
    teams.set(team, { points: previous.points + entry.points, bestFinish: Math.min(previous.bestFinish, entry.position || Infinity) });
  }
  return [...teams].sort((a, b) => b[1].points - a[1].points || a[1].bestFinish - b[1].bestFinish)[0]?.[0] || null;
}

export function isManualResult(current?: StoredResult | null): boolean {
  return !!current && (current.manualOverride === true || !current.source || (current.source === "manual" && current.manualOverride !== false));
}

export function needsScoring(current: StoredResult | null, digest: string): boolean {
  return current?.sourceDigest !== digest || current.scoredDigest !== digest;
}

function podium(entries: Entry[], driverId: (entry: Entry) => string | undefined) {
  const winners = [1, 2, 3].map((position) => entries.find((entry) => entry.position === position));
  if (winners.some((entry) => !entry || !entry.is_classified)) return null;
  const mapped = winners.map((entry) => driverId(entry!));
  return mapped.every(Boolean) && new Set(mapped).size === 3 ? mapped as [string, string, string] : null;
}

async function fetchSession(roundId: string, code: string): Promise<Entry[] | null> {
  const response = await getJson<FeedResult>(`${BASE}/results/${encodeURIComponent(roundId)}/${code}/`);
  if (response.data?.code !== code || response.data.round.id !== roundId || !Array.isArray(response.data.results)) return null;
  return response.data.results;
}

async function syncRace(race: Race, event: ScheduleEvent, now: Date): Promise<void> {
  const db = getDB();
  const drivers = await db.collection<{ id: string; number: number; team: string }>("drivers").find({}).toArray();
  const byCode = new Map(drivers.map((driver) => [driver.id.toUpperCase(), driver]));
  const byNumber = new Map(drivers.map((driver) => [driver.number, driver]));
  const teams = new Map(drivers.map((driver) => [clean(driver.team), driver.team]));
  const driverFor = (entry: Entry) => byCode.get(entry.driver.abbreviation) || byNumber.get(entry.driver.permanent_car_number || -1);
  const teamFor = (entry: Entry) => driverFor(entry)?.team || teams.get(clean(entry.team.name)) ||
    (clean(entry.team.name) === "rb f1 team" ? teams.get("racing bulls") : undefined);
  const due = (code: string) => {
    const start = event.schedule.find((session) => session.code === code)?.timestamp;
    const minimum = code === "R" ? 3 * 60 * 60_000 : 90 * 60_000;
    return !!start && now.getTime() >= new Date(start).getTime() + minimum;
  };
  for (const [type, qualifyingCode, finishCode] of [["race", "Q", "R"], ...(race.sprintWeekend ? [["sprint", "SQ", "SR"]] : [])] as [Kind, string, string][]) {
    const current = await db.collection<StoredResult>("results").findOne({ raceId: race.raceId, type });
    if (isManualResult(current)) continue;
    if (!due(qualifyingCode) && !due(finishCode)) continue;
    let fields: StoredResult = { raceId: race.raceId, type, pole: current?.pole || "", p1: current?.p1 || "", p2: current?.p2 || "",
      p3: current?.p3 || "", bestConstructor: current?.bestConstructor || "", status: "partial", source: "jolpica", sourceRoundId: event.round.id };
    if (due(qualifyingCode)) {
      const qualifying = await fetchSession(event.round.id, qualifyingCode);
      const poleEntry = qualifying?.find((entry) => entry.position === 1 && entry.is_classified);
      const pole = poleEntry && driverFor(poleEntry)?.id;
      if (pole && qualifying && qualifying.length >= 18) fields.pole = pole;
    }
    if (due(finishCode)) {
      const finish = await fetchSession(event.round.id, finishCode);
      if (finish && finish.length >= 18) {
        const topThree = podium(finish, (entry) => driverFor(entry)?.id);
        const constructor = topConstructor(finish, teamFor);
        if (topThree && constructor) fields = { ...fields, p1: topThree[0], p2: topThree[1], p3: topThree[2], bestConstructor: constructor };
      }
    }
    if (!fields.pole && !fields.p1) continue;
    fields.status = fields.pole && fields.p1 && fields.p2 && fields.p3 && fields.bestConstructor ? "complete" : "partial";
    // Never regress a complete classification to partial during a provider outage.
    if (current?.status === "complete" && fields.status === "partial") continue;
    const digest = createHash("sha256").update(JSON.stringify([fields.p1, fields.p2, fields.p3, fields.pole, fields.bestConstructor])).digest("hex");
    if (!needsScoring(current, digest)) continue;
    const saved = await db.collection<StoredResult>("results").findOneAndUpdate(
      { raceId: race.raceId, type, manualOverride: { $ne: true } },
      { $set: { ...fields, sourceDigest: digest, syncedAt: now, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after" },
    );
    if (saved && !saved.manualOverride) {
      await scoreStoredResult(saved);
      await db.collection<StoredResult>("results").updateOne(
        { raceId: race.raceId, type, sourceDigest: digest, manualOverride: { $ne: true } },
        { $set: { scoredDigest: digest } },
      );
    }
  }
  await db.collection<Race>("races").updateOne({ raceId: race.raceId }, { $set: {
    jolpicaRoundId: event.round.id,
    ...(Number.isInteger(event.round.number) && (event.round.number || 0) > 0 ? { round: event.round.number } : {}),
  } });
}

export async function syncDueResults(now = new Date()): Promise<void> {
  const db = getDB();
  const races = await db.collection<Race>("races").find({ cancelled: { $ne: true } }).toArray();
  const candidates = races.filter((race) => {
    const q = absoluteSessionDate(race.sprintQualifyingStartTime || race.qualifyingStartTime);
    return q && now.getTime() >= q.getTime() + 30 * 60_000;
  }).sort((a, b) => new Date(b.raceStartTime || 0).getTime() - new Date(a.raceStartTime || 0).getTime());
  if (!candidates.length) return;
  const schedules = new Map<number, { data?: { events: ScheduleEvent[] } }>();
  let processed = 0;
  for (const race of candidates) {
    if (processed >= 4) break;
    const state = db.collection("resultSync");
    await state.updateOne({ _id: race.raceId as any }, { $setOnInsert: { nextAttemptAt: new Date(0) } }, { upsert: true });
    const locked = await state.findOneAndUpdate(
      { _id: race.raceId as any, nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
      { $set: { leaseUntil: new Date(now.getTime() + 4 * 60_000) } }, { returnDocument: "after" },
    );
    if (!locked) continue;
    processed++;
    try {
      const year = new Date(race.raceStartTime!).getUTCFullYear();
      let schedule = schedules.get(year);
      if (!schedule) {
        schedule = await getJson<{ data?: { events: ScheduleEvent[] } }>(`${BASE}/schedules/${year}/`);
        schedules.set(year, schedule);
      }
      const event = matchEvent(race, schedule.data?.events || []);
      if (event) await syncRace(race, event, now);
      const recent = now.getTime() - new Date(race.raceStartTime!).getTime() < 2 * 86_400_000;
      await state.updateOne({ _id: race.raceId as any }, { $set: { status: event ? "matched" : "unmatched", roundId: event?.round.id || null, lastCheckedAt: now,
        nextAttemptAt: new Date(now.getTime() + (recent ? 5 * 60_000 : 24 * 60 * 60_000)) }, $unset: { leaseUntil: "", lastError: "" } });
    } catch (error) {
      await state.updateOne({ _id: race.raceId as any }, { $set: { status: "error", lastError: String(error), lastCheckedAt: now,
        nextAttemptAt: new Date(now.getTime() + 30 * 60_000) }, $unset: { leaseUntil: "" } });
      console.error(`Result sync failed for ${race.raceId}:`, error);
    }
  }
}
