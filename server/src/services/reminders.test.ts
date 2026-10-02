import test from "node:test";
import assert from "node:assert/strict";
import { dueQualifyingSessions, mondaySendAt, type Race } from "./reminders.js";

const race: Race = {
  raceId: "test-race",
  raceName: "Test Grand Prix",
  circuitName: "Test Circuit",
  qualifyingStartTime: "2026-10-10T13:00:00Z",
  sprintQualifyingStartTime: "2026-10-09T13:00:00Z",
  raceStartTime: "2026-10-11T12:00:00Z",
  sprintWeekend: true,
};

test("Monday send time is 9 AM India time for the race week", () => {
  assert.equal(mondaySendAt(new Date(race.raceStartTime!)).toISOString(), "2026-10-05T03:30:00.000Z");
  assert.equal(mondaySendAt(new Date("2026-10-10T20:00:00Z")).toISOString(), "2026-10-05T03:30:00.000Z");
  // A Sunday evening US race can be Monday in India, but belongs to the prior race week.
  assert.equal(mondaySendAt(new Date("2026-10-25T20:00:00Z"), "America/Chicago").toISOString(), "2026-10-19T03:30:00.000Z");
});

test("sprint and Grand Prix qualifying each have a separate one-hour alert", () => {
  assert.deepEqual(dueQualifyingSessions(race, new Date("2026-10-09T12:00:00Z")).map((item) => item.type), ["sprint"]);
  assert.deepEqual(dueQualifyingSessions(race, new Date("2026-10-10T12:00:00Z")).map((item) => item.type), ["race"]);
  assert.deepEqual(dueQualifyingSessions(race, new Date("2026-10-10T13:00:00Z")), []);
});

test("non-sprint weekends and invalid session times do not create sprint alerts", () => {
  assert.deepEqual(dueQualifyingSessions({ ...race, sprintWeekend: false }, new Date("2026-10-09T12:00:00Z")), []);
  assert.deepEqual(dueQualifyingSessions({ ...race, qualifyingStartTime: "bad" }, new Date("2026-10-10T12:00:00Z")), []);
  assert.deepEqual(dueQualifyingSessions({ ...race, qualifyingStartTime: "2026-10-10T13:00" }, new Date("2026-10-10T12:00:00Z")), []);
});
