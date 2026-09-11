/**
 * Scoring Audit & Repair Script
 * 
 * Connects to the live MongoDB database to:
 * 1. Detect any score records that show evidence of the rescore bug
 *    (p2Points=18, polePoints=5, podiumBonusPoints=10, or sprint scores
 *     with un-halved values)
 * 2. Report affected users
 * 3. Rescore ALL races with results using the fixed scoring engine
 * 4. Recalculate every user's totalPoints
 */

import dns from "dns";
import { MongoClient, ObjectId } from "mongodb";
import { calculatePredictionScore, POINTS } from "../utils/scoring.js";

// Match server.ts DNS configuration
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const MONGODB_URI = process.env.MONGODB_URI ||
  "mongodb+srv://Pree:pree1234@cluster0.o2h7vze.mongodb.net/f1_prediction_league?retryWrites=true&w=majority";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  F1 Predictor Pro — Scoring Audit & Repair");
  console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (no writes)" : "🔧 LIVE FIX"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("f1_prediction_league");

  const scoresCol = db.collection("scores");
  const predictionsCol = db.collection("predictions");
  const resultsCol = db.collection("results");
  const usersCol = db.collection("users");

  // ── Step 1: Detect buggy score records ──────────────────────────────

  console.log("─── Step 1: Scanning for buggy score records ───\n");

  // The rescore bug produced these specific wrong values:
  // P2=18 instead of 20, Pole=5 instead of 10, Podium=10 instead of 20
  const buggyScores = await scoresCol.find({
    $or: [
      { p2Points: 18 },              // Should be 20 (race) or 10 (sprint)
      { p2Points: 9 },               // 18 * 0.5 would be 9, but bug had no multiplier
      { polePoints: 5 },             // Should be 10 (race) or 5 (sprint) — ambiguous for race
      { podiumBonusPoints: 10 },     // Should be 20 (race) or 10 (sprint) — ambiguous for race
    ],
  }).toArray();

  // Filter to definitive evidence: race-type scores with wrong values
  const definitelyBuggy = buggyScores.filter(s => {
    if (s.type === "race") {
      // For race type, these values are definitively wrong
      return s.p2Points === 18 || s.polePoints === 5 || s.podiumBonusPoints === 10;
    }
    // For sprint, the bug would have stored un-halved values (25/18/15/5/10)
    // instead of correct halved values (12.5/10/7.5/5/10)
    if (s.type === "sprint") {
      return s.p1Points === 25 || s.p2Points === 18 || s.p3Points === 15 || s.polePoints === 5;
    }
    return false;
  });

  if (definitelyBuggy.length === 0) {
    console.log("✅ No score records found with definitive evidence of the rescore bug.");
    console.log("   This means 'Rescore Race' was likely never used, or");
    console.log("   no users had matching predictions when it was used.\n");
  } else {
    console.log(`⚠️  Found ${definitelyBuggy.length} score records with rescore bug evidence:\n`);
    for (const score of definitelyBuggy) {
      const user = await usersCol.findOne({ _id: new ObjectId(score.userId) }).catch(() => null);
      const prediction = await predictionsCol.findOne({ userId: score.userId, raceWeekendId: score.raceId, type: score.type });
      const result = await resultsCol.findOne({ raceId: score.raceId, type: score.type });
      
      // Calculate what the correct score should be
      let correctScore = null;
      if (prediction && result) {
        correctScore = calculatePredictionScore(prediction, result, score.type);
      }
      
      console.log(
        `   User: ${user?.name || score.userId} | Race: ${score.raceId} | Type: ${score.type}`
      );
      console.log(
        `     DB score:  P1=${score.p1Points} P2=${score.p2Points} P3=${score.p3Points} Pole=${score.polePoints} ` +
        `Podium=${score.podiumBonusPoints} Constructor=${score.constructorPoints || 0} Unexpected=${score.unexpectedPoints || 0} Total=${score.total}`
      );
      if (correctScore) {
        const unexpectedPoints = score.unexpectedPoints || 0;
        const correctTotal = correctScore.raceTotal + unexpectedPoints;
        const delta = correctTotal - score.total;
        console.log(
          `     Correct:   P1=${correctScore.p1Points} P2=${correctScore.p2Points} P3=${correctScore.p3Points} Pole=${correctScore.polePoints} ` +
          `Podium=${correctScore.podiumBonusPoints} Constructor=${correctScore.constructorPoints} Unexpected=${unexpectedPoints} Total=${correctTotal}`
        );
        if (delta !== 0) {
          console.log(`     ⚡ DELTA: ${delta >= 0 ? "+" : ""}${delta} points`);
        } else {
          console.log(`     ✓ Score matches (coincidentally correct for sprint 0.5x)`);
        }
      }
      if (prediction) {
        console.log(`     Prediction: P1=${prediction.predictedP1} P2=${prediction.predictedP2} P3=${prediction.predictedP3} Pole=${prediction.predictedPole} Constructor=${prediction.predictedConstructor || "—"}`);
      }
      if (result) {
        console.log(`     Result:     P1=${result.p1} P2=${result.p2} P3=${result.p3} Pole=${result.pole} BestConstructor=${result.bestConstructor || "—"}`);
      }
      console.log();
    }
    console.log();
  }

  // ── Step 2: Full audit — rescore everything with correct engine ─────

  console.log("─── Step 2: Full rescore audit (all races with results) ───\n");

  const allResults = await resultsCol.find({}).toArray();
  console.log(`Found ${allResults.length} result records to audit.\n`);

  let totalDiscrepancies = 0;
  let totalFixed = 0;
  const affectedUsers = new Map<string, { name: string; oldTotal: number; newTotal: number }>();
  const discrepancyDetails: Array<{
    userId: string;
    userName: string;
    raceId: string;
    type: string;
    field: string;
    oldVal: number;
    newVal: number;
  }> = [];

  for (const result of allResults) {
    const raceId = result.raceId;
    const type = result.type;

    // Get all predictions for this race+type
    const predictions = await predictionsCol
      .find({ raceWeekendId: raceId, type })
      .toArray();

    for (const prediction of predictions) {
      const existingScore = await scoresCol.findOne({
        userId: prediction.userId,
        raceId,
        type,
      });

      if (!existingScore) continue; // No score record = never scored

      // Calculate what the score SHOULD be
      const correct = calculatePredictionScore(prediction, result, type);

      // Compare each field
      const checks = [
        { field: "p1Points", old: existingScore.p1Points || 0, correct: correct.p1Points },
        { field: "p2Points", old: existingScore.p2Points || 0, correct: correct.p2Points },
        { field: "p3Points", old: existingScore.p3Points || 0, correct: correct.p3Points },
        { field: "polePoints", old: existingScore.polePoints || 0, correct: correct.polePoints },
        { field: "podiumBonusPoints", old: existingScore.podiumBonusPoints || 0, correct: correct.podiumBonusPoints },
        { field: "constructorPoints", old: existingScore.constructorPoints || 0, correct: correct.constructorPoints },
      ];

      const wrongFields = checks.filter(c => c.old !== c.correct);

      if (wrongFields.length > 0) {
        totalDiscrepancies++;
        const user = await usersCol.findOne({ _id: new ObjectId(prediction.userId) }).catch(() => null);
        const userName = user?.name || prediction.userId;

        for (const wf of wrongFields) {
          discrepancyDetails.push({
            userId: prediction.userId,
            userName,
            raceId,
            type,
            field: wf.field,
            oldVal: wf.old,
            newVal: wf.correct,
          });
        }

        const unexpectedPoints = existingScore.unexpectedPoints || 0;
        const correctTotal = correct.raceTotal + unexpectedPoints;
        const oldTotal = existingScore.total || 0;

        console.log(
          `  ❌ MISMATCH: ${userName} | ${raceId} (${type}) | ` +
          `Score: ${oldTotal} → ${correctTotal} (Δ ${correctTotal - oldTotal >= 0 ? "+" : ""}${correctTotal - oldTotal})`
        );
        for (const wf of wrongFields) {
          console.log(`     └─ ${wf.field}: ${wf.old} → ${wf.correct}`);
        }

        // Fix the score
        if (!DRY_RUN) {
          await scoresCol.updateOne(
            { _id: existingScore._id },
            {
              $set: {
                p1Points: correct.p1Points,
                p2Points: correct.p2Points,
                p3Points: correct.p3Points,
                polePoints: correct.polePoints,
                podiumBonusPoints: correct.podiumBonusPoints,
                constructorPoints: correct.constructorPoints,
                total: correctTotal,
                updatedAt: new Date(),
              },
            }
          );
          totalFixed++;
        }

        // Track user for totalPoints recalculation
        if (!affectedUsers.has(prediction.userId)) {
          affectedUsers.set(prediction.userId, {
            name: userName,
            oldTotal: user?.totalPoints || 0,
            newTotal: 0,
          });
        }
      }
    }
  }

  // ── Step 3: Recalculate totalPoints for affected users ─────────────

  if (affectedUsers.size > 0 && !DRY_RUN) {
    console.log("\n─── Step 3: Recalculating totalPoints for affected users ───\n");

    for (const [userId, info] of affectedUsers) {
      const allScores = await scoresCol.find({ userId }).toArray();
      const newTotal = allScores.reduce((sum, s) => sum + (s.total || 0), 0);
      info.newTotal = newTotal;

      try {
        await usersCol.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { totalPoints: newTotal } }
        );
      } catch {
        await usersCol.updateOne(
          { _id: userId as any },
          { $set: { totalPoints: newTotal } }
        );
      }

      console.log(
        `  ✅ ${info.name}: totalPoints ${info.oldTotal} → ${newTotal} ` +
        `(Δ ${newTotal - info.oldTotal >= 0 ? "+" : ""}${newTotal - info.oldTotal})`
      );
    }
  }

  // ── Summary ────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Results audited:     ${allResults.length}`);
  console.log(`  Score mismatches:    ${totalDiscrepancies}`);
  console.log(`  Scores fixed:        ${DRY_RUN ? `0 (dry run — would fix ${totalDiscrepancies})` : totalFixed}`);
  console.log(`  Users affected:      ${affectedUsers.size}`);

  if (affectedUsers.size > 0) {
    console.log("\n  Affected users:");
    for (const [, info] of affectedUsers) {
      const delta = info.newTotal - info.oldTotal;
      console.log(
        `    • ${info.name}: ${info.oldTotal} → ${DRY_RUN ? "?" : info.newTotal} pts` +
        `${!DRY_RUN ? ` (${delta >= 0 ? "+" : ""}${delta})` : ""}`
      );
    }
  }

  if (DRY_RUN && totalDiscrepancies > 0) {
    console.log("\n  ⚠️  Run without --dry-run to apply fixes:");
    console.log("     node --import tsx server/src/scripts/audit-scores.ts");
  }

  console.log("═══════════════════════════════════════════════════════════\n");

  await client.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
