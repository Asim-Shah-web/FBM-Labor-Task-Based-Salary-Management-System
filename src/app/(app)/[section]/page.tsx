import { notFound } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { requirePagePermission } from "@/server/authz/require";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Placeholder for modules that are not built yet. Permission is still enforced server-side.
export function generateStaticParams() {
  return NAV_ITEMS.filter((i) => i.key !== "dashboard").map((i) => ({ section: i.href.slice(1) }));
}
export const dynamicParams = false;

export default async function SectionPlaceholder({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = NAV_ITEMS.find((i) => i.href === `/${section}` && i.key !== "dashboard");
  if (!item) notFound();
  await requirePagePermission(item.permission);

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">{item.label}</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This module is scheduled for Phase {item.phase}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
