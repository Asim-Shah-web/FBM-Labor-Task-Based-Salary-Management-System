"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDate, isValidIsoDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Date selector that drives the ?date=YYYY-MM-DD search param. `max` is today (no future dates). */
export function DatePicker({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (d: string) => isValidIsoDate(d) && d <= max && router.push(`${pathname}?date=${d}`);

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label="Previous day" onClick={() => go(addDays(value, -1))}>
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div className="flex flex-col">
        <Input type="date" value={value} max={max} onChange={(e) => go(e.target.value)} className="w-44" aria-label="Date" />
      </div>
      <Button type="button" variant="outline" size="icon" aria-label="Next day" disabled={value >= max} onClick={() => go(addDays(value, 1))}>
        <ChevronRight className="h-5 w-5" />
      </Button>
      <span className="hidden text-sm text-muted-foreground sm:inline">{formatDate(value)}</span>
      {value !== max && (
        <Button type="button" variant="ghost" size="sm" onClick={() => go(max)}>Today</Button>
      )}
    </div>
  );
}
