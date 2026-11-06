import { describe, expect, it } from "vitest";
import { addDays, formatDate, fromDbDate, isValidIsoDate, resolveDateParam, todayKarachi, toDbDate } from "@/lib/dates";

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isValidIsoDate("2026-11-06")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("06/11/2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
  it("handles leap years", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
  });
  it("round-trips to the DB date without shifting a day", () => {
    expect(fromDbDate(toDbDate("2026-10-01"))).toBe("2026-10-01");
    expect(toDbDate("2026-10-01").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("uses Pakistan time for 'today'", () => {
    // 20:30 UTC on 5 Nov is already 6 Nov (01:30) in Karachi (UTC+5)
    expect(todayKarachi(new Date("2026-11-05T20:30:00Z"))).toBe("2026-11-06");
    expect(todayKarachi(new Date("2026-11-05T18:30:00Z"))).toBe("2026-11-05");
  });
  it("formats for display", () => {
    expect(formatDate("2026-11-06")).toBe("06 Nov 2026");
  });
  it("rejects future or invalid ?date= params", () => {
    expect(resolveDateParam("2026-11-01", "2026-11-06")).toBe("2026-11-01");
    expect(resolveDateParam("2026-12-01", "2026-11-06")).toBe("2026-11-06");
    expect(resolveDateParam("nope", "2026-11-06")).toBe("2026-11-06");
    expect(resolveDateParam(undefined, "2026-11-06")).toBe("2026-11-06");
  });
});
