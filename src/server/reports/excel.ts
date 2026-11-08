import ExcelJS from "exceljs";
import { formatCell, isNumeric } from "@/lib/reports/format";
import { formatDate } from "@/lib/dates";
import type { Report } from "@/lib/reports/types";

/** Excel export: numbers are written as real numeric cells (money formatted to 2 dp) so totals work in Excel. */
export async function reportToXlsx(report: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FBM Labor System";
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  const widths: number[] = [];
  const track = (i: number, len: number) => { widths[i] = Math.min(Math.max(widths[i] ?? 10, len + 2), 42); };

  const title = ws.addRow([report.title]); title.font = { bold: true, size: 14 };
  if (report.subtitle) ws.addRow([report.subtitle]);
  ws.addRow([`Generated: ${formatDate(report.generatedAt)}   (amounts in PKR)`]);
  for (const f of report.filters) ws.addRow([f]);
  ws.addRow([]);

  if (report.summary?.length) {
    for (const s of report.summary) {
      const r = ws.addRow([s.label, isNumeric(s.type) ? Number(s.value) : s.value]);
      r.getCell(1).font = { bold: true };
      if (s.type === "money") r.getCell(2).numFmt = "#,##0.00";
      track(0, s.label.length);
    }
    ws.addRow([]);
  }

  for (const sec of report.sections) {
    if (sec.heading) { const h = ws.addRow([sec.heading]); h.font = { bold: true, size: 12 }; }
    const head = ws.addRow(sec.columns.map((c) => c.label));
    head.font = { bold: true };
    head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }; c.border = { bottom: { style: "thin" } }; });
    sec.columns.forEach((c, i) => track(i, c.label.length));

    const writeRow = (values: Record<string, string>, bold: boolean) => {
      const cells = sec.columns.map((c) => {
        const v = values[c.key];
        if (v === undefined || v === "") return null;
        if (c.type === "money" || c.type === "qty" || c.type === "int") return Number(v);
        return formatCell(c, v, { currency: false });
      });
      const r = ws.addRow(cells);
      sec.columns.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        if (c.type === "money") cell.numFmt = "#,##0.00";
        else if (c.type === "qty") cell.numFmt = "#,##0.###";
        else if (c.type === "int") cell.numFmt = "0";
        if (bold) cell.font = { bold: true };
        const raw = values[c.key];
        track(i, raw ? formatCell(c, raw, { currency: false }).length : 0);
      });
    };
    if (sec.rows.length === 0) ws.addRow([sec.emptyText ?? "No data."]);
    else sec.rows.forEach((row) => writeRow(row, false));
    if (sec.totals && sec.rows.length) {
      writeRow(sec.totals, true);
      ws.lastRow?.eachCell((c) => { c.border = { top: { style: "thin" } }; });
    }
    ws.addRow([]);
  }
  for (const n of report.notes ?? []) ws.addRow([`Note: ${n}`]);

  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
