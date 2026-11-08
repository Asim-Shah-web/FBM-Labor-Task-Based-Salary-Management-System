import PDFDocument from "pdfkit";
import { formatCell, isNumeric } from "@/lib/reports/format";
import { formatDate } from "@/lib/dates";
import type { Column, Report, Section } from "@/lib/reports/types";

const MARGIN = 28;
const FONT = "Helvetica";
const BOLD = "Helvetica-Bold";
const SIZE = 8;

const WEIGHT: Record<Column["type"], number> = { text: 2.2, money: 1.2, qty: 1, int: 0.8, date: 1.1, status: 1.2 };

/** PDF export (A4 landscape). Tables break across pages and repeat their header row. */
export function reportToPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN, bufferPages: true, info: { Title: report.title, Author: "FBM Labor System" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = () => doc.page.width - MARGIN * 2;
    const bottom = () => doc.page.height - MARGIN - 14;

    doc.font(BOLD).fontSize(15).text(report.title, MARGIN, MARGIN);
    doc.font(FONT).fontSize(9);
    if (report.subtitle) doc.text(report.subtitle);
    doc.fillColor("#555").text(`Generated ${formatDate(report.generatedAt)}. Amounts in PKR.`).fillColor("#000");
    for (const f of report.filters) doc.text(f);
    doc.moveDown(0.6);

    if (report.summary?.length) {
      for (const s of report.summary) {
        doc.font(BOLD).fontSize(9).text(`${s.label}: `, { continued: true }).font(FONT).text(formatCell({ key: "v", label: "", type: s.type }, s.value, { currency: false }));
      }
      doc.moveDown(0.8);
    }

    const drawSection = (sec: Section) => {
      if (sec.heading) {
        if (doc.y > bottom() - 40) doc.addPage();
        doc.font(BOLD).fontSize(10).text(sec.heading, MARGIN, doc.y);
        doc.moveDown(0.3);
      }
      const total = sec.columns.reduce((a, c) => a + WEIGHT[c.type], 0);
      const colW = sec.columns.map((c) => (WEIGHT[c.type] / total) * width());
      const x = (i: number) => MARGIN + colW.slice(0, i).reduce((a, b) => a + b, 0);
      const pad = 3;

      const rowHeight = (cells: string[], bold: boolean) => {
        doc.font(bold ? BOLD : FONT).fontSize(SIZE);
        return Math.max(...cells.map((t, i) => doc.heightOfString(t || " ", { width: colW[i]! - pad * 2 })), SIZE) + pad * 2;
      };
      const drawRow = (cells: string[], bold: boolean, fill?: string) => {
        const h = rowHeight(cells, bold);
        if (doc.y + h > bottom()) { doc.addPage(); drawHeader(); }
        const y = doc.y;
        if (fill) doc.rect(MARGIN, y, width(), h).fill(fill).fillColor("#000");
        doc.font(bold ? BOLD : FONT).fontSize(SIZE);
        cells.forEach((t, i) => doc.text(t, x(i) + pad, y + pad, { width: colW[i]! - pad * 2, align: isNumeric(sec.columns[i]!.type) ? "right" : "left" }));
        doc.moveTo(MARGIN, y + h).lineTo(MARGIN + width(), y + h).strokeColor("#d1d5db").lineWidth(0.4).stroke().strokeColor("#000");
        doc.y = y + h;
      };
      const drawHeader = () => drawRow(sec.columns.map((c) => c.label), true, "#e5e7eb");
      const cellsOf = (v: Record<string, string>) => sec.columns.map((c) => formatCell(c, v[c.key], { currency: false }));

      drawHeader();
      if (sec.rows.length === 0) drawRow([sec.emptyText ?? "No data.", ...sec.columns.slice(1).map(() => "")], false);
      else sec.rows.forEach((r) => drawRow(cellsOf(r), false));
      if (sec.totals && sec.rows.length) drawRow(cellsOf(sec.totals), true, "#f3f4f6");
      doc.moveDown(0.8);
      doc.x = MARGIN;
    };

    report.sections.forEach(drawSection);
    if (report.notes?.length) {
      doc.font(FONT).fontSize(8).fillColor("#555");
      for (const n of report.notes) doc.text(`Note: ${n}`, MARGIN, doc.y, { width: width() });
      doc.fillColor("#000");
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font(FONT).fontSize(7).fillColor("#777").text(`${report.title}   |   Page ${i - range.start + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN - 4, { width: width(), align: "center", lineBreak: false });
    }
    doc.end();
  });
}
