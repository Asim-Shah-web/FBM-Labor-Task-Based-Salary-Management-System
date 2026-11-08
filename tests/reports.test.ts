import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { reportToXlsx } from "@/server/reports/excel";
import { reportToPdf } from "@/server/reports/pdf";
import { daysBetween, monthBounds, parseParams, resolveAsOf, resolvePeriod } from "@/lib/reports/period";
import { formatCell, plainMoney } from "@/lib/reports/format";
import type { Report } from "@/lib/reports/types";

const report: Report = {
  type: "monthly-wage", title: "Monthly Wage Report", subtitle: "Month: 2026-10", filters: ["Department: Stitching"], generatedAt: "2026-11-07",
  summary: [{ label: "Total earned", value: "1530.00", type: "money" }],
  sections: [{
    heading: "Workers",
    columns: [{ key: "worker", label: "Worker", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "earned", label: "Earned", type: "money" }, { key: "n", label: "Count", type: "int" }, { key: "s", label: "Status", type: "status" }],
    rows: [{ worker: "W-0001 · Ali", date: "2026-10-01", earned: "1300.00", n: "2", s: "PARTIAL" }, { worker: "W-0002 · Bilal", date: "2026-10-02", earned: "230.50", n: "1", s: "PAID" }],
    totals: { worker: "Total", earned: "1530.50" },
  }, { heading: "Empty", columns: [{ key: "a", label: "A", type: "text" }], rows: [], emptyText: "Nothing here." }],
  notes: ["Earned is by work date."],
};

describe("report periods", () => {
  it("computes month bounds incl. leap years", () => {
    expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthBounds("2028-02").end).toBe("2028-02-29");
    expect(monthBounds("2027-02").end).toBe("2027-02-28");
  });
  it("month overrides range; defaults to month-to-date", () => {
    expect(resolvePeriod({ month: "2026-09", start: "2026-01-01", end: "2026-01-31" }, "2026-11-07")).toMatchObject({ start: "2026-09-01", end: "2026-09-30" });
    expect(resolvePeriod({ start: "2026-10-05", end: "2026-10-20" }, "2026-11-07")).toMatchObject({ start: "2026-10-05", end: "2026-10-20" });
    expect(resolvePeriod({}, "2026-11-07")).toMatchObject({ start: "2026-11-01", end: "2026-11-07" });
  });
  it("rejects reversed or oversized ranges", () => {
    expect(() => resolvePeriod({ start: "2026-10-20", end: "2026-10-05" })).toThrow(/on or before/);
    expect(() => resolvePeriod({ start: "2024-01-01", end: "2026-01-01" })).toThrow(/at most/);
  });
  it("counts days inclusively", () => { expect(daysBetween("2026-10-01", "2026-10-31")).toBe(31); });
  it("as-of date is never in the future", () => {
    expect(resolveAsOf({ asOf: "2030-01-01" }, "2026-11-07")).toBe("2026-11-07");
    expect(resolveAsOf({ asOf: "2026-10-15" }, "2026-11-07")).toBe("2026-10-15");
    expect(resolveAsOf({ asOf: "garbage" }, "2026-11-07")).toBe("2026-11-07");
  });
  it("parses search params safely", () => {
    expect(parseParams({ month: " 2026-10 ", workerId: ["a", "b"], department: "" })).toMatchObject({ month: "2026-10", workerId: "a", department: undefined });
  });
});

describe("report formatting", () => {
  it("formats cells by type", () => {
    expect(formatCell({ key: "m", label: "", type: "money" }, "1234.5")).toBe("Rs. 1,234.50");
    expect(formatCell({ key: "m", label: "", type: "money" }, "1234.5", { currency: false })).toBe("1,234.50");
    expect(formatCell({ key: "d", label: "", type: "date" }, "2026-10-01")).toBe("01 Oct 2026");
    expect(formatCell({ key: "s", label: "", type: "status" }, "PARTIAL")).toBe("Partially Paid");
    expect(plainMoney("1000000")).toBe("1,000,000.00");
  });
});

describe("exports", () => {
  it("writes an Excel workbook with numeric money cells", async () => {
    const buf = await reportToXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const cells: unknown[] = [];
    ws.eachRow((r) => r.eachCell((c) => cells.push(c.value)));
    expect(cells).toContain("Monthly Wage Report");
    expect(cells).toContain(1300);
    expect(cells).toContain(1530.5);
    expect(cells).toContain("Nothing here.");
  });
  it("writes a valid multi-section PDF", async () => {
    const buf = await reportToPdf(report);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
  });
  it("paginates a long report without error", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ worker: `W-${i} · Worker`, date: "2026-10-01", earned: "100.00", n: "1", s: "UNPAID" }));
    const big: Report = { ...report, sections: [{ ...report.sections[0]!, rows }] };
    const buf = await reportToPdf(big);
    expect(buf.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(5);
  });
});
