import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useStore } from "../state/useStore.ts";
import { NameTag } from "./NameTag.tsx";

/** Sends people who haven't finished onboarding to /welcome. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile } = useStore();
  if (!profile) return <Navigate to="/welcome" replace />;
  return children;
}

/**
 * Shows writer-only screens to writers. Readers get a one-tap way to start
 * writing instead of a dead end.
 */
export function RequireWriter({ children }: { children: ReactNode }) {
  const { hasRole, addRole, showToast, profile } = useStore();
  if (hasRole("writer")) return children;
  return (
    <div className="gate">
      <NameTag name={profile?.name.split(" ")[0] ?? "You"} size="m" tilt={-4} />
      <h1>Write jokes too?</h1>
      <p>
        Submit your own dad jokes. If curators pick one, every reader gets it that day and you see the
        views, reactions and tips. You'll keep getting your daily joke.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          addRole("writer");
          showToast("You can write jokes now.");
        }}
      >
        Start writing
      </button>
      <p className="gate-note">You can turn this off in your profile.</p>
    </div>
  );
}
