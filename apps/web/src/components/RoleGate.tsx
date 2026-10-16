import { useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useStore } from "../state/useStore.ts";
import { NameTag } from "./NameTag.tsx";

/**
 * Lets signed-in, onboarded people through. Waits while the session is being
 * restored, sends signed-out people to /welcome and half-finished sign-ups
 * back to where onboarding continues.
 */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { status, account } = useStore();
  if (status === "loading") return <div className="boot" aria-busy="true" />;
  if (!account) return <Navigate to="/welcome" replace />;
  if (!account.onboarded) return <Navigate to="/welcome/role" replace />;
  return children;
}

/**
 * Shows writer-only screens to writers. Readers get a one-tap way to start
 * writing instead of a dead end.
 */
export function RequireWriter({ children }: { children: ReactNode }) {
  const { hasRole, setRole, showToast, account } = useStore();
  const [busy, setBusy] = useState(false);
  if (hasRole("writer")) return children;
  return (
    <div className="gate">
      <NameTag name={account?.name?.split(" ")[0] ?? "You"} size="m" tilt={-4} />
      <h1>Write jokes too?</h1>
      <p>
        Submit your own dad jokes. If curators pick one, every reader gets it that day and you see the
        views, reactions and tips. You'll keep getting your daily joke.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setRole("writer", true)
            .then(() => showToast("You can write jokes now."))
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Turning on…" : "Start writing"}
      </button>
      <p className="gate-note">You can turn this off in your profile.</p>
    </div>
  );
}
