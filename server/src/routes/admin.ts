import { Router, Request, Response } from "express";
import { Db, ObjectId } from "mongodb";
import { getDB } from "../utils/db.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
import {
  getRaceForPrediction,
  isPredictionDisqualified,
  normalizePredictionType,
} from "../utils/raceLocks.js";
import {
  getOpenF1CountryName,
  getSessionByType,
  getSessions,
  isOpenF1CoolingDown,
  isOpenF1RateLimitError,
  OpenF1Session,
} from "../services/openf1Service.js";
import { calculatePredictionScore } from "../utils/scoring.js";

const router = Router();
let lastRaceEnrichmentRateLimitLogAt = 0;

interface RaceAdminRecord {
  _id: ObjectId;
  raceId: string;
  raceName?: string;
  round: number;
  country?: string;
  countryFlag?: string;
  circuitName?: string;
  qualifyingStartTime?: string;
  raceStartTime?: string;
  timeZone?: string;
  sprintWeekend?: boolean;
  sprintQualifyingStartTime?: string | null;
  sprintStartTime?: string | null;
  openF1QualifyingSessionKey?: number | null;
  openF1RaceSessionKey?: number | null;
  openF1SprintQualifyingSessionKey?: number | null;
  cancelled?: boolean;
  isLocked?: boolean;
  isComplete?: boolean;
}

async function updateUserTotalPoints(db: Db, userId: string): Promise<void> {
  const scoresCollection = db.collection("scores");
  const totalPoints = (await scoresCollection.find({ userId }).toArray()).reduce(
    (sum, score) => sum + (score.total || 0),
    0
  );

  try {
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { totalPoints } }
    );
  } catch (e) {
    await db.collection("users").updateOne(
      { _id: userId as any },
      { $set: { totalPoints } }
    );
  }
}

/**
 * PUBLIC: GET /api/admin/races
 * Get all races - accessible without authentication
 */
router.get("/races", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    
    const races = await racesCollection.find({}).sort({ round: 1 }).toArray() as RaceAdminRecord[];
    const sessionsByRaceKey = new Map<string, OpenF1Session[]>();
    let openF1RateLimited = isOpenF1CoolingDown();

    if (!openF1RateLimited) {
      for (const race of races) {
        const raceDate = race.raceStartTime ? new Date(race.raceStartTime) : null;
        const openF1Country = getOpenF1CountryName(race);

        if (!openF1Country || !raceDate || Number.isNaN(raceDate.getTime())) continue;

        const key = `${raceDate.getUTCFullYear()}:${openF1Country}`;
        if (sessionsByRaceKey.has(key)) continue;

        try {
          sessionsByRaceKey.set(key, await getSessions(raceDate.getUTCFullYear(), openF1Country));
        } catch (error) {
          if (isOpenF1RateLimitError(error)) {
            openF1RateLimited = true;
            break;
          }

          console.warn(
            `OpenF1 session lookup failed for ${openF1Country} ${raceDate.getUTCFullYear()}:`,
            error instanceof Error ? error.message : error
          );
          sessionsByRaceKey.set(key, []);
        }
      }
    }

    if (openF1RateLimited && Date.now() - lastRaceEnrichmentRateLimitLogAt > 60_000) {
      console.warn("OpenF1 race enrichment paused: API rate limit reached.");
      lastRaceEnrichmentRateLimitLogAt = Date.now();
    }

    const enrichedRaces = races.map((r) => {
      const raceDate = r.raceStartTime ? new Date(r.raceStartTime) : null;
      const openF1Country = getOpenF1CountryName(r);
      const key =
        openF1Country && raceDate && !Number.isNaN(raceDate.getTime())
          ? `${raceDate.getUTCFullYear()}:${openF1Country}`
          : "";
      const sessions = sessionsByRaceKey.get(key) || [];
      const qualifyingSession = getSessionByType(sessions, "Qualifying");
      const raceSession = getSessionByType(sessions, "Race");
      const sprintQualifyingSession = r.sprintWeekend ? getSessionByType(sessions, "Sprint Qualifying") : null;

      return {
        ...r,
        openF1QualifyingSessionKey: qualifyingSession?.session_key || r.openF1QualifyingSessionKey || null,
        openF1RaceSessionKey: raceSession?.session_key || r.openF1RaceSessionKey || null,
        openF1SprintQualifyingSessionKey:
          sprintQualifyingSession?.session_key || r.openF1SprintQualifyingSessionKey || null,
        qualifyingStartTime: qualifyingSession?.date_start || r.qualifyingStartTime,
        sprintQualifyingStartTime: sprintQualifyingSession?.date_start || r.sprintQualifyingStartTime,
      };
    });
    
    res.json({
      success: true,
      data: enrichedRaces.map((r) => ({
        id: r._id.toString(),
        raceId: r.raceId,
        raceName: r.raceName,
        round: r.round,
        country: r.country || "",
        countryFlag: r.countryFlag,
        circuitName: r.circuitName,
        qualifyingStartTime: r.qualifyingStartTime,
        raceStartTime: r.raceStartTime,
        timeZone: r.timeZone,
        sprintWeekend: r.sprintWeekend,
        sprintQualifyingStartTime: r.sprintQualifyingStartTime,
        sprintStartTime: r.sprintStartTime,
        openF1QualifyingSessionKey: r.openF1QualifyingSessionKey || null,
        openF1RaceSessionKey: r.openF1RaceSessionKey || null,
        openF1SprintQualifyingSessionKey: r.openF1SprintQualifyingSessionKey || null,
        cancelled: r.cancelled || false,
        isLocked: r.isLocked || false,
        isComplete: r.isComplete || false,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch races";
    console.error("Get races error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

// Apply auth middleware to all admin routes below
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Get all users with their statistics
 */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const usersCollection = db.collection("users");
    const predictionsCollection = db.collection("predictions");
    const scoresCollection = db.collection("scores");

    const users = await usersCollection.find({}).toArray();

    // Enrich users with stats
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const predictions = await predictionsCollection
          .countDocuments({ userId: user._id.toString() });
        const scores = await scoresCollection.findOne({ userId: user._id.toString() });
        const totalPoints = scores?.totalPoints || 0;

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role || "user",
          totalPoints,
          predictions,
          hidden: user.hidden || false,
          createdAt: user.createdAt,
        };
      })
    );

    res.json({ success: true, data: usersWithStats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch users";
    console.error("Admin get users error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const usersCollection = db.collection("users");
    const predictionsCollection = db.collection("predictions");
    const resultsCollection = db.collection("results");
    const scoresCollection = db.collection("scores");

    const totalUsers = await usersCollection.countDocuments();
    const adminCount = await usersCollection.countDocuments({ role: "admin" });
    const totalPredictions = await predictionsCollection.countDocuments();
    const totalResults = await resultsCollection.countDocuments();
    const totalScores = await scoresCollection.countDocuments();

    // Get top users
    const topUsers = await usersCollection
      .find({})
      .sort({ totalPoints: -1 })
      .limit(5)
      .toArray();

    res.json({
      success: true,
      data: {
        totalUsers,
        adminCount,
        regularUsers: totalUsers - adminCount,
        totalPredictions,
        totalResults,
        totalScores,
        topUsers: topUsers.map((u) => ({
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          totalPoints: u.totalPoints || 0,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    console.error("Admin get stats error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/users/:userId/role
 * Toggle user admin role
 */
router.post("/users/:userId/role", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({
      _id: new ObjectId(userId),
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const newRole = user.role === "admin" ? "user" : "admin";
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role: newRole } }
    );

    res.json({
      success: true,
      data: { userId, newRole, message: `User role changed to ${newRole}` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update role";
    console.error("Admin toggle role error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete a user and their related data
 */
router.delete("/users/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    const usersCollection = db.collection("users");
    const predictionsCollection = db.collection("predictions");
    const scoresCollection = db.collection("scores");

    const user = await usersCollection.findOne({
      _id: new ObjectId(userId),
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Delete user's predictions and scores
    const predictionsResult = await predictionsCollection.deleteMany({
      userId,
    });
    const scoresResult = await scoresCollection.deleteMany({
      userId,
    });

    // Delete the user
    const userResult = await usersCollection.deleteOne({
      _id: new ObjectId(userId),
    });

    res.json({
      success: true,
      data: {
        deletedUser: user.name,
        deletedPredictions: predictionsResult.deletedCount,
        deletedScores: scoresResult.deletedCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user";
    console.error("Admin delete user error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/predictions
 * Get all predictions with scoring information
 */
router.get("/predictions", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const predictionsCollection = db.collection("predictions");
    const usersCollection = db.collection("users");
    const scoresCollection = db.collection("scores");

    const predictions = await predictionsCollection.find({}).toArray();

    // Enrich predictions with user and score data
    const enrichedPredictions = await Promise.all(
      predictions.map(async (pred) => {
        let user = null;
        try {
          // Try to find user by ObjectId
          if (pred.userId && typeof pred.userId === 'string') {
            try {
              user = await usersCollection.findOne({
                _id: new ObjectId(pred.userId),
              });
            } catch (e) {
              // If not a valid ObjectId, try as direct _id string
              user = await usersCollection.findOne({
                _id: pred.userId as any,
              });
            }
          }
        } catch (err) {
          console.error(`Failed to lookup user for prediction ${pred._id}:`, err);
        }

        // Note: predictions use raceWeekendId, but we need to match against raceId in scores
        const score = await scoresCollection.findOne({
          userId: pred.userId,
          raceId: pred.raceWeekendId,
          type: pred.type,
        });

        return {
          id: pred._id.toString(),
          raceId: pred.raceWeekendId,
          type: pred.type,
          userId: pred.userId,
          userName: user?.name || "Unknown",
          userEmail: user?.email || "Unknown",
          p1: pred.predictedP1,
          p2: pred.predictedP2,
          p3: pred.predictedP3,
          pole: pred.predictedPole,
          predictedConstructor: pred.predictedConstructor,
          unexpected: pred.unexpectedStatement,
          score: score?.total || 0,
          createdAt: pred.createdAt,
        };
      })
    );

    res.json({ success: true, data: enrichedPredictions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch predictions";
    console.error("Admin get predictions error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/results
 * Get all race results
 */
router.get("/results", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const resultsCollection = db.collection("results");

    const results = await resultsCollection.find({}).toArray();

    const formattedResults = results.map((r) => ({
      id: r._id.toString(),
      raceId: r.raceId,
      type: r.type,
      p1: r.p1,
      p2: r.p2,
      p3: r.p3,
      pole: r.pole,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    res.json({ success: true, data: formattedResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch results";
    console.error("Admin get results error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/results
 * Create or update race results and calculate scores
 */
router.post("/results", async (req: Request, res: Response) => {
  try {
    const { raceId, type, p1, p2, p3, pole, bestConstructor } = req.body;

    if (!raceId || !type) {
      return res.status(400).json({ success: false, error: "Missing raceId or type" });
    }
    
    if (!p1 && !p2 && !p3 && !pole && !bestConstructor) {
      return res.status(400).json({ success: false, error: "At least one position or bestConstructor is required" });
    }

    const db = getDB();
    const resultsCollection = db.collection("results");
    const predictionsCollection = db.collection("predictions");
    const scoresCollection = db.collection("scores");
    const race = await getRaceForPrediction(raceId);
    const predictionType = normalizePredictionType(type);

    if (!race) {
      return res.status(404).json({ success: false, error: "Race weekend not found" });
    }

    // Save result
    const result = await resultsCollection.findOneAndUpdate(
      { raceId, type },
      {
        $set: {
          raceId,
          type,
          p1,
          p2,
          p3,
          pole,
          bestConstructor,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // Calculate scores for all predictions for this race
    const predictions = await predictionsCollection
      .find({ raceWeekendId: raceId, type })
      .toArray();

    console.log(`[SCORING] Results entered for raceId: ${raceId}, type: ${type}`);
    console.log(`[SCORING] Found ${predictions.length} predictions to score`);

    let disqualifiedCount = 0;
    const touchedUserIds = new Set<string>();

    // Calculate score for each prediction (WITHOUT unexpected bonus - requires admin approval)
    for (const prediction of predictions) {
      console.log(`[SCORING] DEBUG: Processing prediction - raceWeekendId: ${prediction.raceWeekendId}, userId: "${prediction.userId}", type of userId: ${typeof prediction.userId}`);
      touchedUserIds.add(prediction.userId);

      if (isPredictionDisqualified(race, prediction, predictionType)) {
        await scoresCollection.deleteOne({ userId: prediction.userId, raceId, type });
        disqualifiedCount++;
        console.log(`[SCORING] Disqualified late prediction for user ${prediction.userId}, raceId=${raceId}, type=${type}`);
        continue;
      }
      
      const currentScore = await scoresCollection.findOne({ userId: prediction.userId, raceId, type });
      let unexpectedPoints = currentScore?.unexpectedPoints || 0; // Retain admin approval points
      
      // Use the shared scoring engine (single source of truth for point values)
      const resultFields = {
        p1: p1 || currentScore?.p1,
        p2: p2 || currentScore?.p2,
        p3: p3 || currentScore?.p3,
        pole: pole || currentScore?.pole,
        bestConstructor: bestConstructor || currentScore?.bestConstructor,
      };
      const scored = calculatePredictionScore(prediction, resultFields, type);

      // For partial result updates, preserve existing points for fields not in this payload
      const p1Points = (p1 !== undefined && p1 !== "") ? scored.p1Points : (currentScore?.p1Points || 0);
      const p2Points = (p2 !== undefined && p2 !== "") ? scored.p2Points : (currentScore?.p2Points || 0);
      const p3Points = (p3 !== undefined && p3 !== "") ? scored.p3Points : (currentScore?.p3Points || 0);
      const polePoints = (pole !== undefined && pole !== "") ? scored.polePoints : (currentScore?.polePoints || 0);
      const podiumBonusPoints = (resultFields.p1 && resultFields.p2 && resultFields.p3) ? scored.podiumBonusPoints : (currentScore?.podiumBonusPoints || 0);
      const constructorPoints = (bestConstructor !== undefined && bestConstructor !== "") ? scored.constructorPoints : (currentScore?.constructorPoints || 0);

      const total = p1Points + p2Points + p3Points + polePoints + podiumBonusPoints + unexpectedPoints + constructorPoints;

      console.log(`[SCORING] User ${prediction.userId}: P1=${p1Points}, P2=${p2Points}, P3=${p3Points}, Pole=${polePoints}, Podium=${podiumBonusPoints}, Total=${total}`);

      // Save or update score
      console.log(`[SCORING] DEBUG: Saving score with userId type: ${typeof prediction.userId}, value: "${prediction.userId}"`);
      const upsertResult = await scoresCollection.findOneAndUpdate(
        { userId: prediction.userId, raceId, type },
        {
          $set: {
            userId: prediction.userId,
            raceId,
            type,
            p1Points,
            p2Points,
            p3Points,
            polePoints,
            podiumBonusPoints,
            constructorPoints,
            unexpectedPoints,
            total,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" }
      );
      console.log(`[SCORING] DEBUG: Upsert result - userId in saved doc: "${upsertResult?.userId}", type: ${typeof upsertResult?.userId}`);
    }

    // Update total points in users collection and leaderboard
    const scores = await scoresCollection.find({ raceId }).toArray();
    console.log(`[SCORING] Found ${scores.length} scores to aggregate`);
    const userIdsToUpdate = new Set<string>([
      ...touchedUserIds,
      ...scores.map((score) => score.userId),
    ]);

    for (const userId of userIdsToUpdate) {
      await updateUserTotalPoints(db, userId);
    }

    res.json({
      success: true,
      data: {
        id: result?.value?._id?.toString() || "unknown",
        raceId,
        type,
        predictionsScored: predictions.length - disqualifiedCount,
        disqualifiedPredictions: disqualifiedCount,
        message: "Results saved and predictions scored!",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save result";
    console.error("Admin save result error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/scores/:userId/award-unexpected
 * Award unexpected statement points to a user for a specific race
 */
router.post("/scores/:userId/award-unexpected", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { raceId, type } = req.body;

    if (!raceId || !type) {
      return res.status(400).json({ success: false, error: "Missing raceId or type" });
    }

    const db = getDB();
    const scoresCollection = db.collection("scores");
    const usersCollection = db.collection("users");
    const predictionsCollection = db.collection("predictions");
    const resultsCollection = db.collection("results");
    const predictionType = normalizePredictionType(type);
    const prediction = await predictionsCollection.findOne({
      userId,
      raceWeekendId: raceId,
      type,
    });
    const race = await getRaceForPrediction(raceId);

    if (prediction && race && isPredictionDisqualified(race, prediction, predictionType)) {
      await scoresCollection.deleteOne({ userId, raceId, type });
      await updateUserTotalPoints(db, userId);

      return res.status(400).json({
        success: false,
        error: "Prediction was submitted after qualifying started and is disqualified",
      });
    }

    // Find current score or create one if it doesn't exist
    let currentScore = await scoresCollection.findOne({ userId, raceId, type });
    
    // If no score exists, create one with race points + 15 unexpected points
    if (!currentScore) {
      // Get the results for this race
      const result = await resultsCollection.findOne({
        raceId,
        type,
      });

      // Use shared scoring engine (single source of truth for point values)
      let p1Points = 0, p2Points = 0, p3Points = 0, polePoints = 0, podiumBonusPoints = 0, constructorPoints = 0;
      
      if (prediction && result) {
        const scored = calculatePredictionScore(prediction, result, type);
        p1Points = scored.p1Points;
        p2Points = scored.p2Points;
        p3Points = scored.p3Points;
        polePoints = scored.polePoints;
        podiumBonusPoints = scored.podiumBonusPoints;
        constructorPoints = scored.constructorPoints;
      }

      const raceTotal = p1Points + p2Points + p3Points + polePoints + podiumBonusPoints + constructorPoints;
      
      const newScore = {
        userId,
        raceId,
        type,
        p1Points,
        p2Points,
        p3Points,
        polePoints,
        podiumBonusPoints,
        unexpectedPoints: 15,
        total: raceTotal + 15,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const insertResult = await scoresCollection.insertOne(newScore);
      const createdScore = await scoresCollection.findOne({ _id: insertResult.insertedId });
      if (createdScore) {
        currentScore = createdScore;
      }
      console.log(`[SCORING] Created new score record for user ${userId}: P1=${p1Points}, P2=${p2Points}, P3=${p3Points}, Pole=${polePoints}, Podium=${podiumBonusPoints}, Unexpected=15, Total=${raceTotal + 15}`);
    } else {
      // Score exists, update it with unexpected points
      const newTotal = (currentScore.total || 0) - (currentScore.unexpectedPoints || 0) + 15;

      const updatedScore = await scoresCollection.findOneAndUpdate(
        { userId, raceId, type },
        {
          $set: {
            unexpectedPoints: 15,
            total: newTotal,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      if (!updatedScore) {
        return res.status(404).json({ success: false, error: "Failed to update score" });
      }
      currentScore = updatedScore;
    }

    // Recalculate user's total points
    const allScores = await scoresCollection.find({ userId }).toArray();
    const totalPoints = allScores.reduce((sum, s) => sum + (s.total || 0), 0);
    
    console.log(`[SCORING] Award-unexpected: Calculated totalPoints=${totalPoints} for userId=${userId}`);

    try {
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { totalPoints } }
      );
    } catch (e) {
      console.log(`[SCORING] Award-unexpected: User update failed with ObjectId conversion, trying string match: ${e}`);
      try {
        await usersCollection.updateOne(
          { _id: userId as any },
          { $set: { totalPoints } }
        );
      } catch (e2) {
        console.log(`[SCORING] Award-unexpected: User update with string also failed: ${e2}`);
      }
    }

    console.log(`[SCORING] Award-unexpected SUCCESS: Updated user ${userId} with totalPoints=${totalPoints}`);
    res.json({
      success: true,
      message: "Unexpected statement points awarded!",
      score: currentScore,
      newTotal: totalPoints,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to award points";
    console.error(`[SCORING] Award-unexpected ERROR: ${message}`, error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/scores/:userId/revoke-unexpected
 * Revoke unexpected statement points from a user for a specific race
 */
router.post("/scores/:userId/revoke-unexpected", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { raceId, type } = req.body;

    if (!raceId || !type) {
      return res.status(400).json({ success: false, error: "Missing raceId or type" });
    }

    const db = getDB();
    const scoresCollection = db.collection("scores");
    const usersCollection = db.collection("users");

    // Find current score to recalculate total
    const currentScore = await scoresCollection.findOne({ userId, raceId, type });
    if (!currentScore) {
      return res.status(404).json({ success: false, error: "Score not found" });
    }

    const newTotal = (currentScore.total || 0) - (currentScore.unexpectedPoints || 0);

    // Update the score
    const score = await scoresCollection.findOneAndUpdate(
      { userId, raceId, type },
      {
        $set: {
          unexpectedPoints: 0,
          total: newTotal,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!score) {
      return res.status(404).json({ success: false, error: "Failed to update score" });
    }

    // Recalculate user's total points
    const allScores = await scoresCollection.find({ userId }).toArray();
    const totalPoints = allScores.reduce((sum, s) => sum + (s.total || 0), 0);
    
    try {
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { totalPoints } }
      );
    } catch (e) {
      console.log("Note: User update failed (userId may already be string), but score was updated");
    }

    res.json({
      success: true,
      message: "Unexpected statement points revoked!",
      score,
      newTotal: totalPoints,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke points";
    console.error("Revoke unexpected error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/scores
 * Get all scores for analysis
 */
router.get("/scores", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const scoresCollection = db.collection("scores");
    const usersCollection = db.collection("users");

    const scores = await scoresCollection.find({}).toArray();

    // Enrich with user info
    const enrichedScores = await Promise.all(
      scores.map(async (score) => {
        const user = await usersCollection.findOne({
          _id: new ObjectId(score.userId),
        });

        return {
          id: score._id.toString(),
          userId: score.userId,
          userName: user?.name || "Unknown",
          raceId: score.raceId,
          type: score.type,
          p1Points: score.p1Points || 0,
          p2Points: score.p2Points || 0,
          p3Points: score.p3Points || 0,
          polePoints: score.polePoints || 0,
          podiumBonusPoints: score.podiumBonusPoints || 0,
          constructorPoints: score.constructorPoints || 0,
          unexpectedPoints: score.unexpectedPoints || 0,
          total: score.total || 0,
          createdAt: score.createdAt,
        };
      })
    );

    res.json({ success: true, data: enrichedScores });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch scores";
    console.error("Admin get scores error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/admin/cleanup-test-data
 * Remove test users and their related data
 * This is a utility endpoint for development/cleanup
 */
router.delete("/cleanup-test-data", async (req: Request, res: Response) => {
  try {
    const db = getDB();

    // Test user patterns to identify
    const testPatterns = [
      "alice",
      "bob",
      "charlie",
      "example.com",
      "test",
      "user",
      "john doe",
    ];

    // Find users that match test patterns
    const usersCollection = db.collection("users");
    const testUsers = await usersCollection
      .find({
        $or: [
          { name: { $regex: testPatterns.join("|"), $options: "i" } },
          { email: { $regex: testPatterns.join("|"), $options: "i" } },
        ],
      })
      .toArray();

    console.log(`Found ${testUsers.length} test users to remove`);

    if (testUsers.length === 0) {
      return res.json({
        success: true,
        message: "No test users found",
        deletedUsers: 0,
        deletedPredictions: 0,
      });
    }

    // Get user IDs
    const testUserIds = testUsers.map((u) => u._id.toString());

    // Delete predictions for test users
    const predictionsCollection = db.collection("predictions");
    const predictionsDelete = await predictionsCollection.deleteMany({
      userId: { $in: testUserIds },
    });

    // Delete test users
    const usersDelete = await usersCollection.deleteMany({
      _id: { $in: testUsers.map((u) => u._id) },
    });

    console.log(`Deleted ${usersDelete.deletedCount} test users`);
    console.log(`Deleted ${predictionsDelete.deletedCount} related predictions`);

    res.json({
      success: true,
      message: "Test data cleaned up successfully",
      deletedUsers: usersDelete.deletedCount,
      deletedPredictions: predictionsDelete.deletedCount,
      usernames: testUsers.map((u) => ({ name: u.name, email: u.email })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed";
    console.error("Cleanup error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/users/:userId/predictions
 * Get all predictions for a specific user
 */
router.get("/users/:userId/predictions", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    const predictionsCollection = db.collection("predictions");
    const usersCollection = db.collection("users");

    // Get user info - try ObjectId first, then string
    let user;
    try {
      user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch {
      user = null;
    }
    
    if (!user) {
      user = await usersCollection.findOne({ _id: userId as any });
    }

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Get all predictions for this user
    const predictions = await predictionsCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const formattedPredictions = predictions.map((p) => ({
      id: p._id?.toString() || "",
      raceId: p.raceWeekendId,
      type: p.type || "race",
      userId: p.userId,
      userName: user.name,
      userEmail: user.email,
      p1: p.predictedP1,
      p2: p.predictedP2,
      p3: p.predictedP3,
      pole: p.predictedPole,
      predictedConstructor: p.predictedConstructor,
      unexpected: p.unexpectedStatement || "",
      score: p.score || 0,
      createdAt: p.createdAt,
    }));

    res.json({ success: true, data: formattedPredictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch user predictions";
    console.error("Admin get user predictions error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/users/:userId/visibility
 * Toggle user leaderboard visibility
 */
router.post("/users/:userId/visibility", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    const usersCollection = db.collection("users");

    // Get current user - try ObjectId first, then string
    let user;
    try {
      user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch {
      user = null;
    }
    
    if (!user) {
      user = await usersCollection.findOne({ _id: userId as any });
    }

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Toggle hidden status
    const newHidden = !user.hidden;
    const updateId = user._id instanceof ObjectId ? user._id : new ObjectId(userId);
    
    await usersCollection.updateOne(
      { _id: updateId },
      { $set: { hidden: newHidden, updatedAt: new Date() } }
    );

    res.json({
      success: true,
      message: newHidden ? "User hidden from leaderboard" : "User visible on leaderboard",
      hidden: newHidden,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to toggle visibility";
    console.error("Admin toggle visibility error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/rescore-race
 * Recalculate scores for all predictions in a race
 */
router.post("/rescore-race", async (req: Request, res: Response) => {
  try {
    const { raceId, type } = req.body;

    if (!raceId || !type) {
      return res.status(400).json({ success: false, error: "Missing raceId or type" });
    }

    const db = getDB();
    const predictionsCollection = db.collection("predictions");
    const resultsCollection = db.collection("results");
    const scoresCollection = db.collection("scores");
    const race = await getRaceForPrediction(raceId);
    const predictionType = normalizePredictionType(type);

    // Get race results
    const result = await resultsCollection.findOne({ raceId, type });
    if (!result) {
      return res.status(404).json({ success: false, error: "Race results not found" });
    }

    if (!race) {
      return res.status(404).json({ success: false, error: "Race weekend not found" });
    }

    // Get all predictions for this race
    const predictions = await predictionsCollection.find({ raceWeekendId: raceId, type }).toArray();

    console.log(`[RESCORING] Starting rescore for raceId=${raceId}, type=${type}, predictions count=${predictions.length}`);

    let scoredCount = 0;
    let disqualifiedCount = 0;
    const userIds = new Set<string>();

    // Calculate and upsert scores for each prediction
    for (const prediction of predictions) {
      userIds.add(prediction.userId);

      if (isPredictionDisqualified(race, prediction, predictionType)) {
        await scoresCollection.deleteOne({ userId: prediction.userId, raceId, type });
        disqualifiedCount++;
        console.log(`[RESCORING] Disqualified late prediction for user ${prediction.userId}, raceId=${raceId}, type=${type}`);
        continue;
      }

      // Use shared scoring engine (single source of truth for point values)
      const scored = calculatePredictionScore(prediction, result, type);
      const { p1Points, p2Points, p3Points, polePoints, podiumBonusPoints, constructorPoints, raceTotal } = scored;

      // Get existing score if it exists (preserve unexpected points)
      const existingScore = await scoresCollection.findOne({
        userId: prediction.userId,
        raceId,
        type,
      });

      const unexpectedPoints = existingScore?.unexpectedPoints || 0;
      const total = raceTotal + unexpectedPoints;

      // Upsert score
      await scoresCollection.findOneAndUpdate(
        { userId: prediction.userId, raceId, type },
        {
          $set: {
            userId: prediction.userId,
            raceId,
            type,
            p1Points,
            p2Points,
            p3Points,
            polePoints,
            podiumBonusPoints,
            constructorPoints,
            unexpectedPoints,
            total,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      scoredCount++;
    }

    // Update user totals
    for (const userId of userIds) {
      await updateUserTotalPoints(db, userId);
    }

    console.log(`[RESCORING] Completed: rescored ${scoredCount} predictions for raceId=${raceId}, disqualified=${disqualifiedCount}`);

    res.json({
      success: true,
      message: `Rescored ${scoredCount} predictions for this race`,
      scoredCount,
      disqualifiedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rescore race";
    console.error("Rescore race error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/data/stats
 * Get actual database statistics
 */
router.get("/data/stats", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const stats = await db.stats();

    const collections = [
      "users",
      "predictions",
      "results",
      "scores",
      "drivers",
      "discussions",
      "polls",
      "pollVotes",
      "messages",
    ];

    const counts: Record<string, number> = {};
    for (const col of collections) {
      counts[col] = await db.collection(col).countDocuments();
    }

    res.json({
      success: true,
      data: {
        storageSizeKB: (stats.storageSize / 1024).toFixed(2),
        documentCounts: counts,
      },
    });
  } catch (error) {
    console.error("Admin data stats error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch database statistics" });
  }
});

/**
 * GET /api/admin/data/export
 * Export all collections
 */
router.get("/data/export", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const exportData: Record<string, any[]> = {};
    const collections = [
      "users",
      "predictions",
      "results",
      "scores",
      "drivers",
      "discussions",
      "polls",
      "pollVotes",
      "messages",
    ];

    for (const col of collections) {
      exportData[col] = await db.collection(col).find({}).toArray();
    }

    res.json({
      success: true,
      exportDate: new Date().toISOString(),
      version: "2.0",
      data: exportData,
    });
  } catch (error) {
    console.error("Admin data export error:", error);
    res.status(500).json({ success: false, error: "Failed to export database backup" });
  }
});

/**
 * POST /api/admin/data/import
 * Import collection backup
 */
router.post("/data/import", async (req: Request, res: Response) => {
  try {
    const backup = req.body;
    
    if (!backup || !backup.data || !backup.exportDate) {
      return res.status(400).json({ success: false, error: "Invalid backup format" });
    }

    const db = getDB();
    const collections = Object.keys(backup.data);
    let importedCollections = 0;

    for (const col of collections) {
      const docs = backup.data[col];
      if (Array.isArray(docs) && docs.length > 0) {
        // Clear collection
        await db.collection(col).deleteMany({});
        
        // Re-type _id to ObjectId if necessary before insert
        const preparedDocs = docs.map((doc: any) => {
          if (doc._id && typeof doc._id === "string") {
            try { doc._id = new ObjectId(doc._id); } catch {}
          }
          return doc;
        });

        await db.collection(col).insertMany(preparedDocs);
        importedCollections++;
      }
    }

    res.json({
      success: true,
      message: `Successfully restored ${importedCollections} collections`,
    });
  } catch (error) {
    console.error("Admin data import error:", error);
    res.status(500).json({ success: false, error: "Failed to import database backup" });
  }
});

/**
 * DELETE /api/admin/data/clear
 * Dangerously clear user data
 */
router.delete("/data/clear", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const collectionsToClear = [
      "users",
      "predictions",
      "results",
      "scores",
      "discussions",
      "polls",
      "pollVotes",
      "messages",
    ]; // Do not clear active drivers!

    for (const col of collectionsToClear) {
      await db.collection(col).deleteMany({});
    }

    res.json({
      success: true,
      message: "Successfully wiped all user data",
    });
  } catch (error) {
    console.error("Admin data clear error:", error);
    res.status(500).json({ success: false, error: "Failed to clear database" });
  }
});

/**
 * GET /api/admin/races/debug/list
 * Debug endpoint to see what races exist in database
 */
router.get("/races/debug/list", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    const count = await racesCollection.countDocuments();
    const sampleRaces = await racesCollection.find({}).limit(3).toArray();
    
    res.json({
      success: true,
      totalRaces: count,
      sampleRaces: sampleRaces.map((r: any) => ({
        _id: r._id?.toString(),
        raceId: r.raceId,
        raceName: r.raceName,
        cancelled: r.cancelled,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get races";
    res.status(500).json({ success: false, error: message });
  }
});


/**
 * PATCH /api/admin/races/:raceId/cancel
 * Toggle cancelled status for a race
 */
router.patch("/races/:raceId/cancel", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    const raceIdParam = req.params.raceId;
    
    console.log(`[ADMIN] Toggle race for: ${raceIdParam}`);
    
    const race = await racesCollection.findOne({ raceId: raceIdParam });
    
    if (!race) {
      console.log(`[ADMIN] Race not found: ${raceIdParam}. Available:`, await racesCollection.find({}).project({ raceId: 1 }).limit(2).toArray());
      return res.status(404).json({ success: false, error: "Race not found" });
    }
    
    const updated = await racesCollection.findOneAndUpdate(
      { raceId: raceIdParam },
      { $set: { cancelled: !race.cancelled, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    
    if (!updated || !updated.value) {
      return res.status(404).json({ success: false, error: "Race not found" });
    }
    
    res.json({
      success: true,
      data: updated.value,
      message: `Race ${updated.value.cancelled ? "cancelled" : "uncancelled"} successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update race";
    console.error("Admin cancel race error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/races/seed
 * Seed database with default race calendar
 * NOTE: This must come BEFORE the generic POST /races route
 */
router.post("/races/seed/default", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    
    // Default race data matching F1 2026 calendar
    const defaultRaces = [
      { raceId: "australia-2026", raceName: "Australian Grand Prix", round: 1, countryFlag: "🇦🇺", circuitName: "Albert Park Circuit", qualifyingStartTime: "2026-03-07T05:00:00Z", raceStartTime: "2026-03-08T04:00:00Z", timeZone: "Australia/Melbourne", sprintWeekend: false, cancelled: false },
      { raceId: "china-2026", raceName: "Chinese Grand Prix", round: 2, countryFlag: "🇨🇳", circuitName: "Shanghai International Circuit", sprintQualifyingStartTime: "2026-03-13T07:00:00Z", qualifyingStartTime: "2026-03-14T07:00:00Z", raceStartTime: "2026-03-15T07:00:00Z", timeZone: "Asia/Shanghai", sprintWeekend: true, cancelled: false },
      { raceId: "japan-2026", raceName: "Japanese Grand Prix", round: 3, countryFlag: "🇯🇵", circuitName: "Suzuka Circuit", qualifyingStartTime: "2026-03-28T06:00:00Z", raceStartTime: "2026-03-29T05:00:00Z", timeZone: "Asia/Tokyo", sprintWeekend: false, cancelled: false },
      { raceId: "bahrain-2026", raceName: "Bahrain Grand Prix", round: 4, countryFlag: "🇧🇭", circuitName: "Bahrain International Circuit", qualifyingStartTime: "2026-04-11T16:00:00Z", raceStartTime: "2026-04-12T15:00:00Z", timeZone: "Asia/Bahrain", sprintWeekend: false, cancelled: false },
      { raceId: "saudi-2026", raceName: "Saudi Arabian Grand Prix", round: 5, countryFlag: "🇦🇸", circuitName: "Jeddah Corniche Circuit", qualifyingStartTime: "2026-04-18T17:00:00Z", raceStartTime: "2026-04-19T17:00:00Z", timeZone: "Asia/Riyadh", sprintWeekend: false, cancelled: false },
      { raceId: "miami-2026", raceName: "Miami Grand Prix", round: 6, countryFlag: "🇺🇸", circuitName: "Miami International Autodrome", sprintQualifyingStartTime: "2026-05-02T00:00:00Z", qualifyingStartTime: "2026-05-02T20:00:00Z", raceStartTime: "2026-05-03T20:00:00Z", timeZone: "America/New_York", sprintWeekend: true, cancelled: false },
      { raceId: "canada-2026", raceName: "Canadian Grand Prix", round: 7, countryFlag: "🇨🇦", circuitName: "Circuit Gilles Villeneuve", sprintQualifyingStartTime: "2026-05-22T20:30:00Z", qualifyingStartTime: "2026-05-23T20:00:00Z", raceStartTime: "2026-05-24T20:00:00Z", timeZone: "America/Toronto", sprintWeekend: true, cancelled: false },
      { raceId: "monaco-2026", raceName: "Monaco Grand Prix", round: 8, countryFlag: "🇲🇨", circuitName: "Circuit de Monaco", qualifyingStartTime: "2026-06-06T14:00:00Z", raceStartTime: "2026-06-07T13:00:00Z", timeZone: "Europe/Monaco", sprintWeekend: false, cancelled: false },
      { raceId: "spain-2026", raceName: "Spanish Grand Prix", round: 9, countryFlag: "🇪🇸", circuitName: "Circuit de Barcelona-Catalunya", qualifyingStartTime: "2026-06-13T14:00:00Z", raceStartTime: "2026-06-14T13:00:00Z", timeZone: "Europe/Madrid", sprintWeekend: false, cancelled: false },
      { raceId: "austria-2026", raceName: "Austrian Grand Prix", round: 10, countryFlag: "🇦🇹", circuitName: "Red Bull Ring", qualifyingStartTime: "2026-06-27T14:00:00Z", raceStartTime: "2026-06-28T13:00:00Z", timeZone: "Europe/Vienna", sprintWeekend: false, cancelled: false },
      { raceId: "britain-2026", raceName: "British Grand Prix", round: 11, countryFlag: "🇬🇧", circuitName: "Silverstone Circuit", sprintQualifyingStartTime: "2026-07-03T15:30:00Z", qualifyingStartTime: "2026-07-04T15:00:00Z", raceStartTime: "2026-07-05T14:00:00Z", timeZone: "Europe/London", sprintWeekend: true, cancelled: false },
      { raceId: "belgium-2026", raceName: "Belgian Grand Prix", round: 12, countryFlag: "🇧🇪", circuitName: "Spa-Francorchamps", qualifyingStartTime: "2026-07-18T14:00:00Z", raceStartTime: "2026-07-19T13:00:00Z", timeZone: "Europe/Brussels", sprintWeekend: false, cancelled: false },
      { raceId: "hungary-2026", raceName: "Hungarian Grand Prix", round: 13, countryFlag: "🇭🇺", circuitName: "Hungaroring", qualifyingStartTime: "2026-07-25T14:00:00Z", raceStartTime: "2026-07-26T13:00:00Z", timeZone: "Europe/Budapest", sprintWeekend: false, cancelled: false },
      { raceId: "dutch-2026", raceName: "Dutch Grand Prix", round: 14, countryFlag: "🇳🇱", circuitName: "Circuit Zandvoort", sprintQualifyingStartTime: "2026-08-21T14:30:00Z", qualifyingStartTime: "2026-08-22T14:00:00Z", raceStartTime: "2026-08-23T13:00:00Z", timeZone: "Europe/Amsterdam", sprintWeekend: true, cancelled: false },
      { raceId: "italy-2026", raceName: "Italian Grand Prix", round: 15, countryFlag: "🇮🇹", circuitName: "Monza Circuit", qualifyingStartTime: "2026-09-05T14:00:00Z", raceStartTime: "2026-09-06T13:00:00Z", timeZone: "Europe/Rome", sprintWeekend: false, cancelled: false },
      { raceId: "madrid-2026", raceName: "Madrid Grand Prix", round: 16, countryFlag: "🇪🇸", circuitName: "Madrid Circuit", qualifyingStartTime: "2026-09-12T14:00:00Z", raceStartTime: "2026-09-13T13:00:00Z", timeZone: "Europe/Madrid", sprintWeekend: false, cancelled: false },
      { raceId: "azerbaijan-2026", raceName: "Azerbaijan Grand Prix", round: 17, countryFlag: "🇦🇿", circuitName: "Baku City Circuit", qualifyingStartTime: "2026-09-25T12:00:00Z", raceStartTime: "2026-09-26T11:00:00Z", timeZone: "Asia/Baku", sprintWeekend: false, cancelled: false },
      { raceId: "singapore-2026", raceName: "Singapore Grand Prix", round: 18, countryFlag: "🇸🇬", circuitName: "Marina Bay Street Circuit", sprintQualifyingStartTime: "2026-10-09T13:00:00Z", qualifyingStartTime: "2026-10-10T13:00:00Z", raceStartTime: "2026-10-11T12:00:00Z", timeZone: "Asia/Singapore", sprintWeekend: true, cancelled: false },
      { raceId: "usa-2026", raceName: "United States Grand Prix", round: 19, countryFlag: "🇺🇸", circuitName: "Circuit of the Americas", qualifyingStartTime: "2026-10-24T21:00:00Z", raceStartTime: "2026-10-25T20:00:00Z", timeZone: "America/Chicago", sprintWeekend: false, cancelled: false },
      { raceId: "mexico-2026", raceName: "Mexico City Grand Prix", round: 20, countryFlag: "🇲🇽", circuitName: "Autódromo Hermanos Rodríguez", qualifyingStartTime: "2026-10-31T21:00:00Z", raceStartTime: "2026-11-01T20:00:00Z", timeZone: "America/Mexico_City", sprintWeekend: false, cancelled: false },
      { raceId: "brazil-2026", raceName: "São Paulo Grand Prix", round: 21, countryFlag: "🇧🇷", circuitName: "Interlagos Circuit", qualifyingStartTime: "2026-11-07T18:00:00Z", raceStartTime: "2026-11-08T17:00:00Z", timeZone: "America/Sao_Paulo", sprintWeekend: false, cancelled: false },
      { raceId: "vegas-2026", raceName: "Las Vegas Grand Prix", round: 22, countryFlag: "🇺🇸", circuitName: "Las Vegas Street Circuit", qualifyingStartTime: "2026-11-21T04:00:00Z", raceStartTime: "2026-11-22T04:00:00Z", timeZone: "America/Los_Angeles", sprintWeekend: false, cancelled: false },
      { raceId: "qatar-2026", raceName: "Qatar Grand Prix", round: 23, countryFlag: "🇶🇦", circuitName: "Losail International Circuit", qualifyingStartTime: "2026-11-28T18:00:00Z", raceStartTime: "2026-11-29T16:00:00Z", timeZone: "Asia/Qatar", sprintWeekend: false, cancelled: false },
      { raceId: "abudhabi-2026", raceName: "Abu Dhabi Grand Prix", round: 24, countryFlag: "🇦🇪", circuitName: "Yas Marina Circuit", qualifyingStartTime: "2026-12-05T14:00:00Z", raceStartTime: "2026-12-06T13:00:00Z", timeZone: "Asia/Dubai", sprintWeekend: false, cancelled: false },
    ];
    
    // Clear existing races
    await racesCollection.deleteMany({});
    
    // Insert default races
    const result = await racesCollection.insertMany(
      defaultRaces.map((race) => ({
        ...race,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    
    res.json({
      success: true,
      message: `Seeded ${Object.keys(result.insertedIds).length} races`,
      data: {
        insertedCount: Object.keys(result.insertedIds).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seed races";
    console.error("Admin seed races error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/races
 * Add a new race
 */
router.post("/races", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    
    const { raceId, raceName, round, countryFlag, circuitName, qualifyingStartTime, raceStartTime, timeZone, sprintWeekend, sprintQualifyingStartTime } = req.body;
    
    // Validate required fields
    if (!raceId || !raceName || !round || !qualifyingStartTime || !raceStartTime) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
    // Check if race already exists
    const existing = await racesCollection.findOne({ raceId });
    if (existing) {
      return res.status(400).json({ success: false, error: "Race with this ID already exists" });
    }
    
    const roundNum = Number(round);
    // Shift rounds up for any race that has round >= roundNum
    await racesCollection.updateMany(
      { round: { $gte: roundNum } },
      { $inc: { round: 1 } }
    );
    
    const newRace = {
      raceId,
      raceName,
      round: roundNum,
      countryFlag,
      circuitName,
      qualifyingStartTime,
      raceStartTime,
      timeZone: timeZone || "UTC",
      sprintWeekend: sprintWeekend || false,
      sprintQualifyingStartTime: sprintQualifyingStartTime || null,
      cancelled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await racesCollection.insertOne(newRace);
    
    res.json({
      success: true,
      data: { _id: result.insertedId, ...newRace },
      message: "Race added successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add race";
    console.error("Admin add race error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PUT /api/admin/races/:raceId
 * Update details of a race
 */
router.put("/races/:raceId", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    const { raceId } = req.params;
    
    const existing = await racesCollection.findOne({ raceId });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Race not found" });
    }
    
    const {
      raceName,
      round,
      countryFlag,
      circuitName,
      qualifyingStartTime,
      raceStartTime,
      timeZone,
      sprintWeekend,
      sprintQualifyingStartTime,
      cancelled,
      isLocked,
      isComplete
    } = req.body;
    
    if (round !== undefined && round !== null) {
      const oldRound = Number(existing.round);
      const newRound = Number(round);
      
      if (oldRound !== newRound) {
        if (newRound < oldRound) {
          // Shift all races with newRound <= round < oldRound up by 1
          await racesCollection.updateMany(
            { round: { $gte: newRound, $lt: oldRound } },
            { $inc: { round: 1 } }
          );
        } else {
          // Shift all races with oldRound < round <= newRound down by 1
          await racesCollection.updateMany(
            { round: { $gt: oldRound, $lte: newRound } },
            { $inc: { round: -1 } }
          );
        }
      }
    }
    
    const updates: any = {
      updatedAt: new Date(),
    };
    
    if (raceName !== undefined) updates.raceName = raceName;
    if (round !== undefined) updates.round = Number(round);
    if (countryFlag !== undefined) updates.countryFlag = countryFlag;
    if (circuitName !== undefined) updates.circuitName = circuitName;
    if (qualifyingStartTime !== undefined) updates.qualifyingStartTime = qualifyingStartTime;
    if (raceStartTime !== undefined) updates.raceStartTime = raceStartTime;
    if (timeZone !== undefined) updates.timeZone = timeZone;
    if (sprintWeekend !== undefined) updates.sprintWeekend = sprintWeekend;
    if (sprintQualifyingStartTime !== undefined) updates.sprintQualifyingStartTime = sprintQualifyingStartTime || null;
    if (cancelled !== undefined) updates.cancelled = cancelled;
    if (isLocked !== undefined) updates.isLocked = isLocked;
    if (isComplete !== undefined) updates.isComplete = isComplete;
    
    const updated = await racesCollection.findOneAndUpdate(
      { raceId },
      { $set: updates },
      { returnDocument: "after" }
    );
    
    res.json({
      success: true,
      data: updated,
      message: "Race updated successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update race";
    console.error("Admin update race error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/admin/races/:raceId
 * Delete a race
 */
router.delete("/races/:raceId", async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const racesCollection = db.collection("races");
    
    const race = await racesCollection.findOne({ raceId: req.params.raceId });
    if (!race) {
      return res.status(404).json({ success: false, error: "Race not found" });
    }
    
    const result = await racesCollection.deleteOne({ raceId: req.params.raceId });
    
    if (result.deletedCount > 0) {
      // Shift rounds down for any race that has round > race.round
      await racesCollection.updateMany(
        { round: { $gt: race.round } },
        { $inc: { round: -1 } }
      );
    }
    
    res.json({ success: true, message: "Race deleted successfully and rounds resequenced" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete race";
    console.error("Admin delete race error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
