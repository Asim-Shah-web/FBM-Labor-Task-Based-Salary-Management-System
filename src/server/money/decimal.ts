import Decimal from "decimal.js";

// Money is always Decimal. Never use JS numbers for amounts.
// Round half up (what people expect on a payslip); 2 decimal places (paisa).
const D = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export const money = (v: Decimal.Value): Money => new D(v);
export const ZERO = money(0);

/** Round to paisa using half-up. */
export const round2 = (v: Decimal.Value): Money => money(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** quantity × rate, rounded to paisa. */
export const lineAmount = (quantity: Decimal.Value, rate: Decimal.Value): Money =>
  round2(money(quantity).mul(money(rate)));

export const sum = (values: Decimal.Value[]): Money => values.reduce<Money>((a, b) => a.plus(b), ZERO);

export const minMoney = (a: Decimal.Value, b: Decimal.Value): Money => D.min(a, b);

/** "Rs. 1,234.50". Whole rupees drop the decimals: "Rs. 1,000". */
export function formatPKR(v: Decimal.Value, opts: { decimals?: "auto" | 2 } = {}): string {
  const d = round2(v);
  const negative = d.isNegative();
  const abs = d.abs();
  const [intPart, frac] = abs.toFixed(2).split(".");
  const grouped = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const showDecimals = opts.decimals === 2 || frac !== "00";
  return `${negative ? "-" : ""}Rs. ${grouped}${showDecimals ? `.${frac}` : ""}`;
}

/** Parse user text such as "1,500" or "230.50". Returns null if not a valid number. */
export function parseMoney(input: string): Money | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return round2(cleaned);
}
