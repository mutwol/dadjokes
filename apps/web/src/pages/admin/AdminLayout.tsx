import { Link, NavLink, Outlet } from "react-router";
import { Icon } from "@/components/ui/icon.tsx";
import type { IconName } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { NameTag } from "../../components/NameTag.tsx";
import { ThemeToggle } from "../../theme/ThemeToggle.tsx";

const GROUPS: { label: string; links: { to: string; label: string; icon: IconName; end?: boolean }[] }[] = [
  {
    label: "Run the site",
    links: [
      { to: "/admin", label: "Overview", icon: "today", end: true },
      { to: "/admin/finance", label: "Money", icon: "coin" },
      { to: "/admin/engagement", label: "Engagement", icon: "chart" },
    ],
  },
  {
    label: "People",
    links: [
      { to: "/admin/people", label: "People", icon: "users" },
      { to: "/admin/moderation", label: "Moderation", icon: "shield" },
    ],
  },
  {
    label: "Automations",
    links: [
      { to: "/admin/workflows", label: "Workflows", icon: "flow" },
      { to: "/admin/runs", label: "Runs", icon: "replay" },
      { to: "/admin/rules", label: "Rule sets", icon: "rules" },
    ],
  },
  {
    label: "Records",
    links: [{ to: "/admin/audit", label: "Audit log", icon: "log" }],
  },
];

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors duration-120 hover:bg-fridge hover:text-ink",
    isActive ? "bg-fridge text-ink" : "text-ink-soft",
  );

const chip = ({ isActive }: { isActive: boolean }) =>
  cn("rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap no-underline transition-colors duration-120", isActive ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)] ring-1 ring-line" : "text-ink-soft hover:text-ink");

/** The admin console frame: a left rail on desktop, a scrolling tab strip on phones. */
export function AdminLayout() {
  return (
    <div className="min-h-dvh lg:pl-[232px]">
      {/*
        Desktop rail: fixed to the window, so it never moves with the page or scrolls as a
        whole. Logo and footer stay put; only the link list scrolls, and only on screens too
        short to show every link.
      */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-paper lg:flex" aria-label="Admin">
        <div className="shrink-0 px-4 pt-6 pb-4">
          <Link to="/admin" className="flex items-center gap-2 self-start p-1 no-underline">
            <NameTag name="Admin" size="s" />
          </Link>
        </div>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-width:thin]">
          {GROUPS.map((g) => (
            <nav key={g.label} className="grid gap-px" aria-label={g.label}>
              <p className="px-3 pb-1 text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">{g.label}</p>
              {g.links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={link}>
                  <Icon name={l.icon} size={18} />
                  {l.label}
                </NavLink>
              ))}
            </nav>
          ))}
        </div>
        <div className="grid shrink-0 gap-px border-t border-line px-4 pt-3 pb-4">
          <ThemeToggle compact className="mb-2 self-start" />
          <Link to="/curate" className={link({ isActive: false })}>
            <Icon name="check" size={18} /> Curation queue
          </Link>
          <Link to="/" className={link({ isActive: false })}>
            <Icon name="back" size={18} /> Back to the app
          </Link>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-line bg-fridge/95 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <NameTag name="Admin" size="s" />
          <Link to="/" className="text-sm font-medium text-ink">
            Back to the app
          </Link>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto px-4 py-3" aria-label="Admin">
          {GROUPS.flatMap((g) => g.links).map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={chip}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="min-w-0 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto grid max-w-wide gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
