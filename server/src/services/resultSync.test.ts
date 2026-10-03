import test from "node:test";
import assert from "node:assert/strict";
import { matchEvent, topConstructor, isManualResult, needsScoring } from "./resultSync.js";
import { calculatePredictionScore } from "../utils/scoring.js";

const event = { round: { id: "round-real", name: "Australian Grand Prix", is_cancelled: false },
  circuit: { name: "Albert Park Grand Prix Circuit" }, schedule: [{ code: "R", timestamp: "2026-03-08T04:00:00Z" }] };

test("matching uses identity, circuit and date rather than round number", () => {
  const race = { raceId: "australia-2026", round: 99, raceName: "Australian Grand Prix", circuitName: "Albert Park Circuit", raceStartTime: "2026-03-08T04:00:00Z" };
  assert.equal(matchEvent(race, [event])?.round.id, "round-real");
  assert.equal(matchEvent({ ...race, raceName: "Bahrain Grand Prix in Malaysia" }, [event]), null);
  assert.equal(matchEvent({ ...race, raceName: "Bahrain Grand Prix in Malaysia", circuitName: "Sepang International Circuit" },
    [{ ...event, round: { ...event.round, name: "Bahrain Grand Prix in Malaysia" }, circuit: { name: "Sepang International Circuit" } }]), null);
  assert.equal(matchEvent({ ...race, raceId: "bahrain-2026", raceName: "Bahrain Grand Prix in Malaysia", circuitName: "Sepang International Circuit", raceStartTime: "2026-10-04T07:00:00Z" },
    [{ ...event, round: { ...event.round, name: "Bahrain Grand Prix in Malaysia" }, circuit: { name: "Sepang International Circuit" }, schedule: [{ code: "R", timestamp: "2026-10-04T07:00:00Z" }] }])?.round.id, "round-real");
  assert.equal(matchEvent({ ...race, circuitName: "Sepang Circuit" }, [event]), null);
  assert.equal(matchEvent({ ...race, raceStartTime: "2026-04-08T04:00:00Z" }, [event]), null);
  assert.equal(matchEvent(race, [event, event]), null);
});

test("2026 Spanish venues match by date and circuit without using the stored round", () => {
  const madrid = { raceId: "madrid-2026", raceName: "Madrid Grand Prix", circuitName: "Madrid Circuit", raceStartTime: "2026-09-13T13:00:00Z" };
  const barcelona = { raceId: "spain-2026", raceName: "Spanish Grand Prix", circuitName: "Circuit de Barcelona-Catalunya", raceStartTime: "2026-06-14T13:00:00Z" };
  const events = [
    { ...event, round: { ...event.round, id: "madrid", name: "Spanish Grand Prix" }, circuit: { name: "Madring" }, schedule: [{ code: "R", timestamp: madrid.raceStartTime }] },
    { ...event, round: { ...event.round, id: "barcelona", name: "Barcelona Grand Prix" }, circuit: { name: "Circuit de Barcelona-Catalunya" }, schedule: [{ code: "R", timestamp: barcelona.raceStartTime }] },
  ];
  assert.equal(matchEvent(madrid, events)?.round.id, "madrid");
  assert.equal(matchEvent(barcelona, events)?.round.id, "barcelona");
  assert.equal(matchEvent({ ...madrid, circuitName: "Sepang Circuit" }, events), null);
  assert.equal(matchEvent({ ...madrid, raceStartTime: barcelona.raceStartTime }, events), null);
});

test("constructor points sum both drivers and best finisher breaks a tie", () => {
  const rows = [
    { team: "Alpha", points: 18, position: 2 }, { team: "Alpha", points: 0, position: 12 },
    { team: "Beta", points: 15, position: 1 }, { team: "Beta", points: 3, position: 9 },
  ].map((row) => ({ ...row, team: { name: row.team }, driver: { abbreviation: "X" }, is_classified: true }));
  assert.equal(topConstructor(rows, (row) => row.team.name), "Beta");
  assert.equal(topConstructor([{ ...rows[0], points: NaN }], (row) => row.team.name), null);
});

test("pole is scored before podium and corrected classifications recalculate points", () => {
  const pick = { predictedP1: "a", predictedP2: "b", predictedP3: "c", predictedPole: "a", predictedConstructor: "Alpha" };
  assert.equal(calculatePredictionScore(pick, { pole: "a" }, "race").raceTotal, 10);
  assert.equal(calculatePredictionScore(pick, { pole: "a", p1: "a", p2: "b", p3: "c", bestConstructor: "Alpha" }, "race").raceTotal, 100);
  assert.equal(calculatePredictionScore(pick, { pole: "b", p1: "a", p2: "b", p3: "c", bestConstructor: "Beta" }, "race").raceTotal, 80);
});

test("manual overrides stay fixed and repeated completed runs do not rescore", () => {
  const base = { raceId: "test", type: "race" as const };
  assert.equal(isManualResult({ ...base }), true);
  assert.equal(isManualResult({ ...base, source: "manual", manualOverride: true }), true);
  assert.equal(isManualResult({ ...base, source: "manual", manualOverride: false }), false);
  assert.equal(needsScoring({ ...base, sourceDigest: "a", scoredDigest: "a" }, "a"), false);
  assert.equal(needsScoring({ ...base, sourceDigest: "a" }, "a"), true);
  assert.equal(needsScoring({ ...base, sourceDigest: "a", scoredDigest: "a" }, "b"), true);
});
