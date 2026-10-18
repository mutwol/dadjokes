import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useStore } from "../state/useStore.ts";
import { CountBadge } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import type { IconName } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { NameTag } from "./NameTag.tsx";
import { ThemeToggle } from "../theme/ThemeToggle.tsx";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/explore", label: "Explore", icon: "explore" },
  { to: "/activity", label: "Activity", icon: "bell" },
  { to: "/studio", label: "Studio", icon: "studio" },
];

const sidebarLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline hover:bg-fridge hover:text-ink",
    isActive ? "bg-fridge text-ink" : "text-ink-soft",
  );

const tab = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-col items-center gap-0.5 py-1.5 text-2xs font-medium no-underline",
    isActive ? "text-ink" : "text-ink-faint",
  );

export function AppShell() {
  const { unread, refreshUnread, hasRole } = useStore();
  const { pathname } = useLocation();
  useEffect(() => {
    refreshUnread();
  }, [pathname, refreshUnread]);
  return (
    <div className="min-h-dvh lg:pl-[240px]">
      {/* Desktop: a Substack-style left rail, fixed to the window so it never scrolls with the page. */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col gap-7 overflow-y-auto overscroll-contain border-r border-line bg-paper px-5 py-7 [scrollbar-width:thin] lg:flex"
        aria-label="Main"
      >
        <Link to="/" className="self-start p-1 no-underline" aria-label="Daddy Jokes, today">
          <NameTag name="Daddy Jokes" size="m" />
        </Link>
        <nav className="grid gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={sidebarLink}>
              <Icon name={n.icon} />
              {n.label}
              {n.to === "/activity" && unread ? <CountBadge count={unread} /> : null}
            </NavLink>
          ))}
          <NavLink to="/me" className={sidebarLink}>
            <Icon name="user" />
            Profile
          </NavLink>
          <NavLink to="/shop" className={sidebarLink}>
            <Icon name="bag" />
            Shop
            <span className="ml-auto rounded-sm bg-butter px-2 py-0.5 text-2xs font-semibold text-butter-ink">Soon</span>
          </NavLink>
        </nav>
        {hasRole("curator") || hasRole("admin") ? (
          <nav className="grid gap-0.5 border-t border-line pt-4" aria-label="Staff">
            <p className="px-3 pb-1 text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">Staff</p>
            <NavLink to="/curate" className={sidebarLink}>
              <Icon name="shield" />
              Curate
            </NavLink>
            {hasRole("admin") ? (
              <NavLink to="/admin" className={sidebarLink}>
                <Icon name="chart" />
                Admin console
              </NavLink>
            ) : null}
          </nav>
        ) : null}
        <Link to="/create" className={button({ block: true })}>
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
        <ThemeToggle compact className="mt-auto self-start" />
      </aside>

      <main className="min-w-0 pb-[calc(var(--spacing-nav)+24px+env(safe-area-inset-bottom))] lg:pb-12">
        <Outlet />
      </main>

      {/* Phone: a tab bar with the write button in the middle. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] grid-cols-5 items-center border-t border-line bg-paper px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Main"
        data-bottom-bar
      >
        {NAV.slice(0, 2).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={tab}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <Link
          to="/create"
          className="grid size-13 -rotate-4 place-items-center justify-self-center rounded-[1rem] bg-tag-red text-white shadow-fab transition-[rotate] duration-160 ease-out hover:rotate-0"
          aria-label="Write a joke"
        >
          <Icon name="plus" size={28} />
        </Link>
        <NavLink to="/studio" className={tab}>
          <Icon name="studio" />
          <span>Studio</span>
        </NavLink>
        <NavLink to="/me" className={tab}>
          <Icon name="user" />
          <span>Profile</span>
        </NavLink>
      </nav>

    </div>
  );
}
