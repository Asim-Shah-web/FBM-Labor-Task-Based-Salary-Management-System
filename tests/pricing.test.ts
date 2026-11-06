import { describe, expect, it } from "vitest";
import { entryAmount, pickRate, validateQuantity } from "@/server/services/pricing";
import { sum } from "@/server/money/decimal";

describe("task pricing", () => {
  it("reproduces the spec example (Rs. 1,600 day)", () => {
    const day = sum([entryAmount(20, 50), entryAmount(10, 30), entryAmount(15, 20)]);
    expect(day.toString()).toBe("1600");
  });
  it("fixed-per-task: 2 tasks x Rs. 800", () => {
    expect(entryAmount(2, 800).toString()).toBe("1600");
  });
  it("adds a discretionary allowance separately", () => {
    expect(sum([1300, 230]).toString()).toBe("1530");
  });
});

describe("rate history", () => {
  const history = [
    { id: "a", rate: "50", effectiveFrom: "2026-01-01" },
    { id: "b", rate: "60", effectiveFrom: "2026-06-01" },
    { id: "c", rate: "70", effectiveFrom: "2026-10-15" },
  ];
  it("picks the version in force on the work date", () => {
    expect(pickRate(history, "2026-05-31")?.id).toBe("a");
    expect(pickRate(history, "2026-06-01")?.id).toBe("b");
    expect(pickRate(history, "2026-10-14")?.id).toBe("b");
    expect(pickRate(history, "2026-10-15")?.id).toBe("c");
  });
  it("returns null before the first rate", () => {
    expect(pickRate(history, "2025-12-31")).toBeNull();
  });
  it("is independent of array order", () => {
    expect(pickRate([...history].reverse(), "2026-07-01")?.id).toBe("b");
  });
});

describe("quantity validation", () => {
  it("accepts valid quantities", () => {
    expect(validateQuantity("PER_UNIT", "20")).toBeNull();
    expect(validateQuantity("PER_UNIT", "2.5")).toBeNull();
    expect(validateQuantity("FIXED_PER_TASK", "3")).toBeNull();
  });
  it("rejects zero, negative and non-numeric", () => {
    expect(validateQuantity("PER_UNIT", "0")).not.toBeNull();
    expect(validateQuantity("PER_UNIT", "-1")).not.toBeNull();
    expect(validateQuantity("PER_UNIT", "abc")).not.toBeNull();
  });
  it("fixed tasks must be whole numbers", () => {
    expect(validateQuantity("FIXED_PER_TASK", "1.5")).not.toBeNull();
  });
  it("limits decimals and size", () => {
    expect(validateQuantity("PER_UNIT", "1.2345")).not.toBeNull();
    expect(validateQuantity("PER_UNIT", "2000000")).not.toBeNull();
  });
});
