import { notFound } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { requirePagePermission } from "@/server/authz/require";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

// Placeholder for modules that are not built yet (Phase 4+). Permission is still enforced server-side.
export const dynamic = "force-dynamic";

export default async function SectionPlaceholder({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = NAV_ITEMS.find((i) => i.href === `/${section}` && i.phase > 6);
  if (!item) notFound();
  await requirePagePermission(item.permission);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={item.label} />
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">This module is scheduled for Phase {item.phase}.</CardContent>
      </Card>
    </div>
  );
}
