import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useStore } from "../state/useStore.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./Icon.tsx";
import { NameTag } from "./NameTag.tsx";
import { CountBadge, Toast, button, cn } from "./ui/index.ts";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/explore", label: "Explore", icon: "explore" },
  { to: "/activity", label: "Activity", icon: "bell" },
  { to: "/studio", label: "Studio", icon: "studio" },
];

const sidebarLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold no-underline hover:bg-fridge hover:text-ink",
    isActive ? "bg-fridge text-ink" : "text-ink-soft",
  );

const tab = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-col items-center gap-0.5 py-1.5 text-2xs font-bold no-underline",
    isActive ? "text-ink" : "text-ink-faint",
  );

export function AppShell() {
  const { toast, unread, refreshUnread } = useStore();
  const { pathname } = useLocation();
  useEffect(() => {
    refreshUnread();
  }, [pathname, refreshUnread]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop: a Substack-style left rail. */}
      <aside
        className="sticky top-0 hidden h-dvh flex-col gap-7 border-r border-line bg-paper px-5 py-7 lg:flex"
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
        </nav>
        <Link to="/create" className={button({ block: true })}>
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
      </aside>

      <main className="min-w-0 pb-[calc(var(--spacing-nav)+24px+env(safe-area-inset-bottom))] lg:pb-12">
        <Outlet />
      </main>

      {/* Phone: a tab bar with the write button in the middle. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] grid-cols-5 items-center border-t border-line bg-paper px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Main"
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

      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}
