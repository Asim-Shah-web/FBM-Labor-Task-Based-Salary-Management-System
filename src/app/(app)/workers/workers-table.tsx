"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";

type Row = {
  id: string; code: string; fullName: string; phone: string | null; department: string | null;
  jobRole: string | null; joiningDate: string; status: "ACTIVE" | "INACTIVE";
};

const col = createColumnHelper<Row>();
const columns = [
  col.accessor("code", { header: "Code", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("fullName", {
    header: "Name",
    cell: (c) => <Link href={`/workers/${c.row.original.id}`} className="font-medium text-primary hover:underline">{c.getValue()}</Link>,
  }),
  col.accessor("department", { header: "Department", cell: (c) => c.getValue() ?? "-" }),
  col.accessor("jobRole", { header: "Role", cell: (c) => c.getValue() ?? "-" }),
  col.accessor("phone", { header: "Phone", cell: (c) => c.getValue() ?? "-" }),
  col.accessor("joiningDate", { header: "Joined", cell: (c) => formatDate(c.getValue()) }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
];

export function WorkersTable({ rows }: { rows: Row[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({ data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  if (rows.length === 0)
    return <Card className="p-8 text-center text-sm text-muted-foreground">No workers match. Add a worker or change the filters.</Card>;

  return (
    <>
      {/* Desktop / tablet table */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3 font-medium">
                    <button type="button" className="inline-flex items-center gap-1" onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                {r.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-3">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {table.getRowModel().rows.map((r) => {
          const w = r.original;
          return (
            <Link key={w.id} href={`/workers/${w.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{w.fullName}</div>
                  <div className="text-xs text-muted-foreground">{w.code}{w.department ? ` · ${w.department}` : ""}</div>
                </div>
                <StatusBadge status={w.status} />
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
