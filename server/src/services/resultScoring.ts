import { ObjectId } from "mongodb";
import { getDB } from "../utils/db.js";
import { getRaceForPrediction, isPredictionDisqualified, normalizePredictionType } from "../utils/raceLocks.js";
import { calculatePredictionScore } from "../utils/scoring.js";

export interface StoredResult {
  raceId: string;
  type: "race" | "sprint";
  p1?: string;
  p2?: string;
  p3?: string;
  pole?: string;
  bestConstructor?: string;
  source?: "jolpica" | "manual";
  sourceRoundId?: string;
  sourceDigest?: string;
  scoredDigest?: string;
  status?: "partial" | "complete";
  manualOverride?: boolean;
  syncedAt?: Date;
}

export async function scoreStoredResult(result: StoredResult): Promise<{ scored: number; disqualified: number }> {
  const db = getDB();
  const race = await getRaceForPrediction(result.raceId);
  if (!race) throw new Error(`Race ${result.raceId} not found`);
  const predictions = await db.collection("predictions").find({ raceWeekendId: result.raceId, type: result.type }).toArray();
  const scores = db.collection("scores");
  const userIds = new Set<string>();
  let scored = 0;
  let disqualified = 0;
  for (const prediction of predictions) {
    const userId = String(prediction.userId);
    userIds.add(userId);
    if (isPredictionDisqualified(race, prediction, normalizePredictionType(result.type))) {
      await scores.deleteMany({ userId, raceId: result.raceId, type: result.type });
      disqualified++;
      continue;
    }
    const existing = await scores.findOne({ userId, raceId: result.raceId, type: result.type });
    const points = calculatePredictionScore(prediction, result, result.type);
    const unexpectedPoints = existing?.unexpectedPoints || 0;
    await scores.updateOne(
      { userId, raceId: result.raceId, type: result.type },
      { $set: { ...points, userId, raceId: result.raceId, type: result.type, unexpectedPoints,
          total: points.raceTotal + unexpectedPoints, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    scored++;
  }
  for (const userId of userIds) {
    const totalPoints = (await scores.find({ userId }).toArray()).reduce((sum, score) => sum + (score.total || 0), 0);
    const filter = ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : { _id: userId as any };
    await db.collection("users").updateOne(filter, { $set: { totalPoints } });
  }
  return { scored, disqualified };
}
