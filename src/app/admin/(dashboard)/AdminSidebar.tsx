"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { logoutAction } from "@/lib/actions/auth";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import type { NavItem } from "@/lib/auth/nav";
import type { AdminRole } from "@prisma/client";

/** Deliberately only the two fields the sidebar renders: anything passed to a
 * Client Component is serialized into the page payload the browser receives. */
export interface SidebarUser {
  fullName: string;
  role: AdminRole;
}

interface AdminSidebarProps {
  companyName: string;
  logoUrl: string | null;
  nav: NavItem[];
  user: SidebarUser;
  /** null hides the bell entirely (role can't view notifications). */
  notificationCount: number | null;
}

function NavLinks({ nav, pathname, onNavigate }: { nav: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {nav.map((item) => {
        const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function SidebarFooter({ user }: { user: SidebarUser }) {
  return (
    <div className="border-t p-3">
      <p className="truncate text-sm font-medium">{user.fullName}</p>
      <p className="mb-2 text-xs text-muted-foreground">{user.role.replace("_", " ")}</p>
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}

function BrandHeader({
  companyName,
  logoUrl,
  notificationCount,
}: {
  companyName: string;
  logoUrl: string | null;
  notificationCount?: number | null;
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={companyName} className="h-9 w-9 shrink-0 object-contain" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{companyName}</p>
        <p className="text-xs text-muted-foreground">Admin</p>
      </div>
      <ThemeToggle />
      {notificationCount !== null && notificationCount !== undefined ? (
        <NotificationBell initialCount={notificationCount} />
      ) : null}
    </div>
  );
}

export function AdminSidebar({ companyName, logoUrl, nav, user, notificationCount }: AdminSidebarProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-card px-4 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName} className="h-7 w-7 shrink-0 object-contain" />
          ) : null}
          <p className="truncate text-sm font-semibold">{companyName}</p>
        </div>
        <ThemeToggle />
        {notificationCount !== null ? <NotificationBell initialCount={notificationCount} /> : null}
        <button
          type="button"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
        >
          {drawerOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <BrandHeader companyName={companyName} logoUrl={logoUrl} />
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <NavLinks nav={nav} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <SidebarFooter user={user} />
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <BrandHeader companyName={companyName} logoUrl={logoUrl} notificationCount={notificationCount} />
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavLinks nav={nav} pathname={pathname} />
        </nav>
        <SidebarFooter user={user} />
      </aside>
    </>
  );
}
