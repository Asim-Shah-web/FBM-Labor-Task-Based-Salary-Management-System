import { describe, expect, it } from "vitest";
import { allocateOldestFirst, pairRecoveries, type EarningRow } from "@/server/services/allocation.engine";

const e = (id: string, workDate: string, outstanding: number, createdAt = "2026-10-20T00:00:00Z"): EarningRow => ({ id, workDate, createdAt, outstanding });
const view = (lines: ReturnType<typeof allocateOldestFirst>) => lines.map((l) => [l.earningId, l.cash.toString(), l.recovery.toString()]);

describe("allocateOldestFirst", () => {
  const oct = [e("o1", "2026-10-01", 1000), e("o2", "2026-10-02", 800), e("o3", "2026-10-03", 1200)];

  it("matches the spec example: pay 1,500 -> 1,000 / 500 / 0", () => {
    expect(view(allocateOldestFirst(oct, 1500, 0))).toEqual([["o1", "1000", "0"], ["o2", "500", "0"]]);
  });
  it("pays everything when the amount equals the outstanding", () => {
    const lines = allocateOldestFirst(oct, 3000, 0);
    expect(lines).toHaveLength(3);
    expect(view(lines)[2]).toEqual(["o3", "1200", "0"]);
  });
  it("rejects an amount above the outstanding", () => {
    expect(() => allocateOldestFirst(oct, 3000.01, 0)).toThrow(/more than the outstanding/);
  });
  it("is independent of input order (sorts by date, then createdAt, then id)", () => {
    const shuffled = [oct[2]!, oct[0]!, oct[1]!];
    expect(view(allocateOldestFirst(shuffled, 1500, 0))).toEqual(view(allocateOldestFirst(oct, 1500, 0)));
    const sameDay = [e("b", "2026-10-01", 100, "2026-10-01T10:00:00Z"), e("a", "2026-10-01", 100, "2026-10-01T09:00:00Z")];
    expect(view(allocateOldestFirst(sameDay, 100, 0))).toEqual([["a", "100", "0"]]);
  });
  it("handles a partially paid date (previous payments already reduced the outstanding)", () => {
    const partly = [e("o1", "2026-10-01", 0.5 * 0 + 300), e("o2", "2026-10-02", 800)];
    expect(view(allocateOldestFirst(partly, 400, 0))).toEqual([["o1", "300", "0"], ["o2", "100", "0"]]);
  });
  it("handles paisa amounts exactly", () => {
    const lines = allocateOldestFirst([e("x", "2026-10-01", 0.1), e("y", "2026-10-02", 0.2)], "0.3", 0);
    expect(view(lines)).toEqual([["x", "0.1", "0"], ["y", "0.2", "0"]]);
  });
  it("combines advance recovery and cash, recovery first within a date", () => {
    expect(view(allocateOldestFirst(oct, 900, 300))).toEqual([["o1", "700", "300"], ["o2", "200", "0"]]);
  });
  it("recovery can span several dates", () => {
    expect(view(allocateOldestFirst(oct, 0, 1500))).toEqual([["o1", "0", "1000"], ["o2", "0", "500"]]);
  });
  it("ignores zero-outstanding rows and zero payments", () => {
    expect(allocateOldestFirst([e("z", "2026-10-01", 0)], 0, 0)).toEqual([]);
  });
  it("conserves money exactly (property check)", () => {
    for (let n = 1; n <= 200; n++) {
      const rows = Array.from({ length: 1 + (n % 7) }, (_, i) => e(`r${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`, ((n * 37 + i * 91) % 5000) + 1));
      const total = rows.reduce((a, r) => a + Number(r.outstanding), 0);
      const cash = Math.floor(((n * 53) % 100) / 100 * total);
      const rec = Math.min(total - cash, (n * 17) % 400);
      const lines = allocateOldestFirst(rows, cash, rec);
      expect(lines.reduce((a, l) => a + Number(l.cash), 0)).toBe(cash);
      expect(lines.reduce((a, l) => a + Number(l.recovery), 0)).toBe(rec);
      lines.forEach((l, i) => expect(Number(l.cash) + Number(l.recovery)).toBeLessThanOrEqual(Number(rows.find((r) => r.id === l.earningId)!.outstanding)));
      // oldest-first: every line except the last must fully clear its earning
      lines.slice(0, -1).forEach((l) => expect(Number(l.cash) + Number(l.recovery)).toBe(Number(rows.find((r) => r.id === l.earningId)!.outstanding)));
    }
  });
});

describe("pairRecoveries", () => {
  it("draws from the oldest advance first and spills to the next", () => {
    const pairs = pairRecoveries(
      [{ id: "a1", outstanding: 500 }, { id: "a2", outstanding: 1000 }],
      [{ earningId: "o1", amount: 300 }, { earningId: "o2", amount: 400 }],
    );
    expect(pairs.map((p) => [p.advanceId, p.earningId, p.amount.toString()])).toEqual([
      ["a1", "o1", "300"], ["a1", "o2", "200"], ["a2", "o2", "200"],
    ]);
  });
  it("rejects recovery above the total advance balance", () => {
    expect(() => pairRecoveries([{ id: "a1", outstanding: 100 }], [{ earningId: "o1", amount: 100.01 }])).toThrow(/unrecovered advance/);
  });
  it("returns nothing when there is no recovery", () => {
    expect(pairRecoveries([{ id: "a1", outstanding: 100 }], [])).toEqual([]);
  });
});
