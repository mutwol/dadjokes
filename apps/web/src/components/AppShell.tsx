import { Link, NavLink, Outlet } from "react-router";
import { useStore } from "../state/useStore.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./Icon.tsx";
import { NameTag } from "./NameTag.tsx";
import "./AppShell.css";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/explore", label: "Explore", icon: "explore" },
  { to: "/activity", label: "Activity", icon: "bell" },
  { to: "/studio", label: "Studio", icon: "studio" },
];

export function AppShell() {
  const { toast } = useStore();
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main">
        <Link to="/" className="sidebar-logo" aria-label="Daddy Jokes, today">
          <NameTag name="Daddy Jokes" size="m" />
        </Link>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className="sidebar-link">
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/me" className="sidebar-link">
            <Icon name="user" />
            Profile
          </NavLink>
        </nav>
        <Link to="/create" className="btn btn-primary btn-block">
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
      </aside>

      <main className="shell-main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.slice(0, 2).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className="tab">
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <Link to="/create" className="tab-create" aria-label="Write a joke">
          <Icon name="plus" size={28} />
        </Link>
        <NavLink to="/studio" className="tab">
          <Icon name="studio" />
          <span>Studio</span>
        </NavLink>
        <NavLink to="/me" className="tab">
          <Icon name="user" />
          <span>Profile</span>
        </NavLink>
      </nav>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
