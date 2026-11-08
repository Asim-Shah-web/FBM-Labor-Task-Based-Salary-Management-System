"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (v: unknown) => `Rs. ${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const compact = (v: number) => (v >= 1_000_000 ? `${v / 1_000_000}M` : v >= 1000 ? `${v / 1000}k` : String(v));

export function DashboardCharts({
  trend, daily,
}: { trend: { month: string; earned: number; cash: number }[]; daily: { day: string; earned: number }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Wages earned vs cash paid (last 6 months)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64" role="img" aria-label="Bar chart of wages earned versus cash paid per month">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={compact} width={40} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                <Bar dataKey="earned" name="Earned (work date)" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cash" name="Cash paid (payment date)" fill="#059669" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">These are two different measures and are never added together.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Task earnings per day (last 14 days)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64" role="img" aria-label="Bar chart of task earnings per day">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={compact} width={40} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="earned" name="Task earnings" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
