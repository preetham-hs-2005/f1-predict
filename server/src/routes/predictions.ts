import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { Prediction } from "../models/Prediction.js";
import { authMiddleware, requireVerifiedEmail } from "../middleware/auth.js";
import { getDB } from "../utils/db.js";
import {
  assertPredictionWindowOpen,
  findLockedPredictionKeys,
  normalizePredictionType,
} from "../utils/raceLocks.js";

const router = Router();

function getStatusCode(error: unknown) {
  return error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
    ? error.statusCode
    : 500;
}

// POST /api/predictions/submit
router.post("/submit", authMiddleware, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const {
      raceWeekendId,
      type: rawType = "race",
      predictedP1,
      predictedP2,
      predictedP3,
      predictedPole,
      predictedConstructor,
      unexpectedStatement,
    } = req.body;

    const type = normalizePredictionType(rawType);

    if (!raceWeekendId || !predictedP1 || !predictedP2 || !predictedP3 || !predictedPole) {
      return res.status(400).json({
        success: false,
        error: "Missing required prediction fields",
      });
    }

    await assertPredictionWindowOpen(raceWeekendId, type);

    // Check if prediction already exists
    const existing = await Prediction.findByUserAndRace(
      req.user.userId,
      raceWeekendId,
      type
    );

    let prediction;
    if (existing) {
      // Update existing prediction
      prediction = await Prediction.update(existing._id!, {
        predictedP1,
        predictedP2,
        predictedP3,
        predictedPole,
        predictedConstructor,
        unexpectedStatement: unexpectedStatement || "",
      });
    } else {
      // Create new prediction
      prediction = await Prediction.create({
        userId: req.user.userId,
        raceWeekendId,
        type,
        predictedP1,
        predictedP2,
        predictedP3,
        predictedPole,
        predictedConstructor,
        unexpectedStatement: unexpectedStatement || "",
      });
    }

    if (!prediction) {
      return res.status(500).json({
        success: false,
        error: "Failed to save prediction",
      });
    }

    res.status(201).json({
      success: true,
      data: Prediction.formatResponse(prediction),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit prediction";
    console.error("Prediction submit error:", message);
    res.status(getStatusCode(error)).json({ success: false, error: message });
  }
});

// GET /api/predictions/user
router.get("/user", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const predictions = await Prediction.findByUser(req.user.userId);

    res.json({
      success: true,
      data: predictions.map(p => Prediction.formatResponse(p)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch predictions";
    console.error("Fetch predictions error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/predictions/public/:userId
router.get("/public/:userId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const lockedKeys = await findLockedPredictionKeys();

    const predictions = await Prediction.findByUser(userId);
    
    // Only return predictions whose own type is locked.
    const filteredPredictions = predictions.filter(p => lockedKeys.includes(`${p.raceWeekendId}:${p.type}`));

    res.json({
      success: true,
      data: filteredPredictions.map(p => Prediction.formatResponse(p)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch public predictions";
    console.error("Fetch public predictions error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/predictions/scores/:userId
// Get scores for a specific user's predictions (shows which predictions earned points)
router.get("/scores/:userId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    const scoresCollection = db.collection<{
      _id?: ObjectId;
      userId: string;
      raceId: string;
      type: "sprint" | "race";
      p1Points?: number;
      p2Points?: number;
      p3Points?: number;
      polePoints?: number;
      podiumBonusPoints?: number;
      constructorPoints?: number;
      unexpectedPoints?: number;
      total?: number;
      createdAt?: Date;
    }>("scores");

    const scores = await scoresCollection
      .find({ userId })
      .toArray();

    const formattedScores = scores.map((score) => ({
      id: score._id?.toString() || "",
      userId: score.userId,
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
    }));

    res.json({
      success: true,
      data: formattedScores,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch user scores";
    console.error("Fetch user scores error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/predictions/:raceWeekendId
router.get("/:raceWeekendId", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { raceWeekendId } = req.params;
    const type = normalizePredictionType(req.query.type);

    const prediction = await Prediction.findByUserAndRace(
      req.user.userId,
      raceWeekendId,
      type
    );

    if (!prediction) {
      return res.status(404).json({
        success: false,
        error: "Prediction not found",
      });
    }

    res.json({
      success: true,
      data: Prediction.formatResponse(prediction),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prediction";
    console.error("Fetch prediction error:", message);
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/predictions/:raceWeekendId
router.put("/:raceWeekendId", authMiddleware, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { raceWeekendId } = req.params;
    const type = normalizePredictionType(req.query.type);
    const {
      predictedP1,
      predictedP2,
      predictedP3,
      predictedPole,
      predictedConstructor,
      unexpectedStatement,
    } = req.body;

    await assertPredictionWindowOpen(raceWeekendId, type);

    const existing = await Prediction.findByUserAndRace(
      req.user.userId,
      raceWeekendId,
      type
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Prediction not found",
      });
    }

    const updatesObj = {
      ...(predictedP1 !== undefined && { predictedP1 }),
      ...(predictedP2 !== undefined && { predictedP2 }),
      ...(predictedP3 !== undefined && { predictedP3 }),
      ...(predictedPole !== undefined && { predictedPole }),
      ...(predictedConstructor !== undefined && { predictedConstructor }),
      ...(unexpectedStatement !== undefined && { unexpectedStatement }),
    };

    const prediction = await Prediction.update(existing._id!, updatesObj);

    if (!prediction) {
      return res.status(500).json({
        success: false,
        error: "Failed to update prediction",
      });
    }

    res.json({
      success: true,
      data: Prediction.formatResponse(prediction),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update prediction";
    console.error("Update prediction error:", message);
    res.status(getStatusCode(error)).json({ success: false, error: message });
  }
});

// DELETE /api/predictions/:raceWeekendId
router.delete("/:raceWeekendId", authMiddleware, requireVerifiedEmail, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { raceWeekendId } = req.params;
    const type = normalizePredictionType(req.query.type);

    await assertPredictionWindowOpen(raceWeekendId, type);

    const deleted = await Prediction.delete(
      req.user.userId,
      raceWeekendId,
      type
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Prediction not found",
      });
    }

    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete prediction";
    console.error("Delete prediction error:", message);
    res.status(getStatusCode(error)).json({ success: false, error: message });
  }
});

export default router;
