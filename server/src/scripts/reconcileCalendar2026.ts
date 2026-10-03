import "dotenv/config";
import dns from "node:dns";
import { MongoClient } from "mongodb";
import { matchEvent } from "../services/resultSync.js";

async function main(): Promise<void> {
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const response = await fetch("https://api.jolpi.ca/f1/alpha/schedules/2026/", {
  headers: { "User-Agent": "F1PredictorPro/1.0 (https://f1predict.dev)" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Jolpica HTTP ${response.status}`);
const schedule = await response.json() as { data?: { events: Parameters<typeof matchEvent>[1] } };
const events = schedule.data?.events || [];
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db("f1_prediction_league");
  const races = await db.collection<Parameters<typeof matchEvent>[0] & { round: number }>("races").find({}).toArray();
  const active = races.filter((race) => !race.cancelled);
  const matches = active.map((race) => ({ race, event: matchEvent(race, events) }));
  const unmatched = matches.filter(({ event }) => !event).map(({ race }) => race.raceId);
  const rounds = matches.map(({ event }) => event?.round.number);
  if (unmatched.length || matches.length !== 23 || new Set(rounds).size !== 23 ||
      rounds.some((number) => !Number.isInteger(number) || (number || 0) < 1 || (number || 0) > 23)) {
    throw new Error(`Calendar verification failed: ${JSON.stringify({ active: matches.length, unmatched, rounds })}`);
  }
  const obsolete = races.filter((race) => race.cancelled && race.raceId === "saudi-2026");
  if (obsolete.length) {
    const references = await Promise.all(["predictions", "results", "scores"].map((name) =>
      db.collection(name).countDocuments(name === "predictions" ? { raceWeekendId: "saudi-2026" } : { raceId: "saudi-2026" })));
    if (references.some(Boolean)) throw new Error("Cancelled Saudi event has linked records; keep it for manual review");
  }
  console.log(JSON.stringify(matches.map(({ race, event }) => ({ raceId: race.raceId, current: race.round, official: event!.round.number }))));
  if (process.argv.includes("--apply")) {
    for (const { race, event } of matches) {
      await db.collection("races").updateOne({ _id: race._id }, { $set: {
        round: event!.round.number, jolpicaRoundId: event!.round.id, updatedAt: new Date(),
      } });
    }
    if (obsolete.length) await db.collection("races").deleteOne({ _id: obsolete[0]._id, cancelled: true });
    console.log("Calendar reconciled to the 23 official 2026 rounds.");
  }
} finally {
  await client.close();
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
