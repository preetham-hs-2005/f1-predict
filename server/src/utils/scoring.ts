/**
 * Scoring Engine — Single source of truth for prediction scoring.
 *
 * Every code path that calculates points MUST use these constants and
 * the `calculatePredictionScore` helper so the values can never diverge.
 */

// ── Point values (before sprint multiplier) ─────────────────────────
export const POINTS = {
  P1: 25,
  P2: 20,
  P3: 15,
  POLE: 10,
  PODIUM_BONUS: 20,   // all three podium positions correct
  CONSTRUCTOR: 10,
  UNEXPECTED: 15,      // admin-awarded bonus
} as const;

export function getSprintMultiplier(type: "sprint" | "race" | string): number {
  return type === "sprint" ? 0.5 : 1;
}

// ── Input / output shapes ────────────────────────────────────────────

export interface PredictionFields {
  predictedP1?: string;
  predictedP2?: string;
  predictedP3?: string;
  predictedPole?: string;
  predictedConstructor?: string;
}

export interface ResultFields {
  p1?: string;
  p2?: string;
  p3?: string;
  pole?: string;
  bestConstructor?: string;
}

export interface ScoreBreakdown {
  p1Points: number;
  p2Points: number;
  p3Points: number;
  polePoints: number;
  podiumBonusPoints: number;
  constructorPoints: number;
  /** Race-based total (excludes unexpected, which is admin-managed). */
  raceTotal: number;
}

// ── Core scoring function ────────────────────────────────────────────

/**
 * Calculate the score for a single prediction against a result.
 *
 * This is the **only** place that maps predictions → points.
 */
export function calculatePredictionScore(
  prediction: PredictionFields | Record<string, any>,
  result: ResultFields | Record<string, any>,
  type: "sprint" | "race" | string,
): ScoreBreakdown {
  const m = getSprintMultiplier(type);

  const p1Points =
    result.p1 && prediction.predictedP1 === result.p1
      ? POINTS.P1 * m
      : 0;

  const p2Points =
    result.p2 && prediction.predictedP2 === result.p2
      ? POINTS.P2 * m
      : 0;

  const p3Points =
    result.p3 && prediction.predictedP3 === result.p3
      ? POINTS.P3 * m
      : 0;

  const polePoints =
    result.pole && prediction.predictedPole === result.pole
      ? POINTS.POLE * m
      : 0;

  // Podium bonus – all three positions correct
  const podiumBonusPoints =
    result.p1 && result.p2 && result.p3 &&
    prediction.predictedP1 === result.p1 &&
    prediction.predictedP2 === result.p2 &&
    prediction.predictedP3 === result.p3
      ? POINTS.PODIUM_BONUS * m
      : 0;

  // Constructor
  const constructorPoints =
    result.bestConstructor &&
    prediction.predictedConstructor &&
    prediction.predictedConstructor === result.bestConstructor
      ? POINTS.CONSTRUCTOR * m
      : 0;

  const raceTotal =
    p1Points + p2Points + p3Points + polePoints + podiumBonusPoints + constructorPoints;

  return {
    p1Points,
    p2Points,
    p3Points,
    polePoints,
    podiumBonusPoints,
    constructorPoints,
    raceTotal,
  };
}
