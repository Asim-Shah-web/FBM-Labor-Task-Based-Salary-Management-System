import { redirect } from "next/navigation";
import { requireUser, can } from "@/server/authz/require";
import { NAV_ITEMS } from "@/lib/nav";
import { AppShell } from "@/components/layout/app-shell";
import { logoutAction } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/change-password");

  // Hiding links is only convenience; every page/action re-checks permissions server-side.
  const items = NAV_ITEMS.filter((i) => can(user, i.permission)).map(({ key, label, href }) => ({ key, label, href }));

  return (
    <AppShell items={items} userName={user.fullName} roleLabel={user.roles.join(", ")} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
