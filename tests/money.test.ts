import { describe, expect, it } from "vitest";
import { formatPKR, lineAmount, money, parseMoney, round2, sum } from "@/server/money/decimal";

describe("money", () => {
  it("computes the spec examples exactly", () => {
    expect(lineAmount(20, 50).toString()).toBe("1000");
    expect(lineAmount(10, 30).toString()).toBe("300");
    expect(lineAmount(15, 20).toString()).toBe("300");
    expect(sum([lineAmount(20, 50), lineAmount(10, 30), lineAmount(15, 20)]).toString()).toBe("1600");
    expect(lineAmount(2, 800).toString()).toBe("1600");
  });

  it("has no floating-point drift", () => {
    expect(money("0.1").plus("0.2").toString()).toBe("0.3");
    expect(sum(Array(10).fill("0.1")).toString()).toBe("1");
  });

  it("rounds half up to 2 decimals", () => {
    expect(round2("2.675").toString()).toBe("2.68"); // binary floats give 2.67
    expect(round2("1.005").toString()).toBe("1.01");
    expect(lineAmount("2.5", "0.01").toString()).toBe("0.03");
  });

  it("adds task earnings and allowance", () => {
    expect(sum([1300, 230]).toString()).toBe("1530");
  });

  it("formats PKR with thousands separators", () => {
    expect(formatPKR(0)).toBe("Rs. 0");
    expect(formatPKR(1000)).toBe("Rs. 1,000");
    expect(formatPKR("1234567.5")).toBe("Rs. 1,234,567.50");
    expect(formatPKR(-250)).toBe("-Rs. 250");
    expect(formatPKR(1600, { decimals: 2 })).toBe("Rs. 1,600.00");
  });

  it("parses user input safely", () => {
    expect(parseMoney("1,500")?.toString()).toBe("1500");
    expect(parseMoney(" 230.5 ")?.toString()).toBe("230.5");
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("1e3")).toBeNull();
  });
});
