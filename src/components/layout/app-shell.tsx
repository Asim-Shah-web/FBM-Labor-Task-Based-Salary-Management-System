"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknoteIcon, CalendarCheck, ClipboardList, HandCoins, LayoutDashboard, ListChecks,
  LogOut, Menu, Settings, ShieldCheck, Users, Wallet, BarChart3, KeyRound, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { NavKey } from "@/lib/nav";

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  workers: Users,
  tasks: ListChecks,
  attendance: CalendarCheck,
  "work-entry": ClipboardList,
  allowances: HandCoins,
  salary: Wallet,
  advances: BanknoteIcon,
  reports: BarChart3,
  users: ShieldCheck,
  settings: Settings,
};

export type ShellNavItem = { key: NavKey; label: string; href: string };

function NavList({ items, onNavigate }: { items: ShellNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b px-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">F</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">FBM Labor</div>
        <div className="text-xs text-muted-foreground">Task-based salary</div>
      </div>
    </div>
  );
}

export function AppShell({
  items, userName, roleLabel, logoutAction, children,
}: {
  items: ShellNavItem[];
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto"><NavList items={items} /></div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          <Brand />
          <div className="overflow-y-auto"><NavList items={items} onNavigate={() => setOpen(false)} /></div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 lg:hidden">
            <div className="truncate text-sm font-semibold">FBM Labor</div>
          </div>
          <div className="hidden min-w-0 flex-1 lg:block" />
          <div className="hidden min-w-0 text-right sm:block">
            <div className="truncate text-sm font-medium">{userName}</div>
            <div className="text-xs text-muted-foreground">{roleLabel}</div>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Change password" title="Change password">
            <Link href="/change-password"><KeyRound className="h-5 w-5" /></Link>
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="icon" aria-label="Log out" title="Log out">
              <LogOut className="h-5 w-5" />
            </Button>
          </form>
        </header>
        <main className="flex-1 p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
