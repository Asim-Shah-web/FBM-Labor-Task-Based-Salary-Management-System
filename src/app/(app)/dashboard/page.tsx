import { requirePagePermission } from "@/server/authz/require";
import { prisma } from "@/server/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Phase 2 placeholder. The four money cards are deliberately separate (never combined);
// real figures arrive in Phases 4-5 from the earnings ledger.
const MONEY_CARDS = [
  { title: "Wages earned (this month)", note: "By work date" },
  { title: "Cash paid (this month)", note: "By payment date" },
  { title: "Outstanding wages", note: "As of selected date" },
  { title: "Unrecovered advances", note: "Issued minus recovered" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePagePermission("report:read");
  const { denied } = await searchParams;
  const activeWorkers = await prisma.worker.count({ where: { status: "ACTIVE" } });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">Foundation build (Phase 2). Modules arrive in the next phases.</p>
      </div>

      {denied === "1" && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          You do not have permission to open that page.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Active workers</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{activeWorkers}</div></CardContent>
        </Card>
        {MONEY_CARDS.map((c) => (
          <Card key={c.title}>
            <CardHeader><CardTitle>{c.title}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-muted-foreground">-</div>
              <p className="text-xs text-muted-foreground">{c.note}. Available after Phase 4.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
