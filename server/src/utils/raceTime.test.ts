import test from "node:test";
import assert from "node:assert/strict";
import { absoluteSessionDate } from "./raceTime.js";

test("session times require an explicit timezone", () => {
  assert.equal(absoluteSessionDate("2026-10-03T13:30"), null);
  assert.equal(absoluteSessionDate("2026-10-03T13:30:00+05:30")?.toISOString(), "2026-10-03T08:00:00.000Z");
  assert.equal(absoluteSessionDate("2026-10-03T08:00:00.000Z")?.toISOString(), "2026-10-03T08:00:00.000Z");
  assert.equal(absoluteSessionDate("not-a-date"), null);
});
