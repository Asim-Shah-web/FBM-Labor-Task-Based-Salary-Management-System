// Report data model shared by the screen, print, Excel and PDF renderers.
// Every report is built ONCE on the server into this structure, so all outputs show identical numbers.
// Values are strings (money as "1234.50", dates as "YYYY-MM-DD"): no floating point anywhere.

export type ReportType = "monthly-wage" | "worker-statement" | "attendance" | "production" | "outstanding" | "advances";

export type ColType = "text" | "money" | "qty" | "int" | "date" | "status";
export type Column = { key: string; label: string; type: ColType };
export type Row = Record<string, string>;

export type Section = {
  heading?: string;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  emptyText?: string;
};

export type Report = {
  type: ReportType;
  title: string;
  subtitle?: string;
  filters: string[]; // human-readable filter descriptions
  summary?: { label: string; value: string; type: ColType }[];
  sections: Section[];
  notes?: string[];
  generatedAt: string; // YYYY-MM-DD (Pakistan time)
};

export type ReportParams = {
  month?: string; // YYYY-MM
  start?: string; // YYYY-MM-DD
  end?: string;
  asOf?: string;
  workerId?: string;
  department?: string;
  taskId?: string;
};
