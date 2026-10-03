import { describe, expect, it } from "vitest";
import { isoToIstInput, istInputToIso } from "./istDateTime";

describe("admin race times", () => {
  it("stores India time as an absolute UTC instant", () => {
    expect(istInputToIso("2026-10-03T13:30")).toBe("2026-10-03T08:00:00.000Z");
    expect(istInputToIso("2026-10-04T12:30")).toBe("2026-10-04T07:00:00.000Z");
  });

  it("round trips absolute times and shows old offset-free values for correction", () => {
    expect(isoToIstInput("2026-10-03T08:00:00.000Z")).toBe("2026-10-03T13:30");
    expect(isoToIstInput("2026-10-03T13:30")).toBe("2026-10-03T13:30");
  });

  it("rejects an ambiguous or missing input", () => {
    expect(() => istInputToIso("")).toThrow(/valid date/);
    expect(() => istInputToIso("2026-10-03T13:30Z")).toThrow(/valid date/);
  });
});
