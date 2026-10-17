import { useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { useStore } from "../state/useStore.ts";
import { NameTag } from "./NameTag.tsx";
import { Button, button } from "./ui/index.ts";

/** The page for someone who can't see a screen yet, with a way forward. */
const gate = "mx-auto grid max-w-form justify-items-start gap-4 px-4 py-14";

/**
 * Lets signed-in, onboarded people through. Waits while the session is being
 * restored, sends signed-out people to /welcome and half-finished sign-ups
 * back to where onboarding continues.
 */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { status, account } = useStore();
  if (status === "loading") return <div className="min-h-dvh" aria-busy="true" />;
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
    <div className={gate}>
      <NameTag name={account?.name?.split(" ")[0] ?? "You"} size="m" tilt={-4} />
      <h1 className="text-3xl">Write jokes too?</h1>
      <p className="text-ink-soft">
        Submit your own dad jokes. If curators pick one, every reader gets it that day and you see the
        views, reactions and tips. You'll keep getting your daily joke.
      </p>
      <Button
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
      </Button>
      <p className="text-sm text-ink-soft">You can turn this off in your profile.</p>
    </div>
  );
}

/** Curation is for staff. Everyone else gets a short explanation, not the queue. */
export function RequireCurator({ children }: { children: ReactNode }) {
  const { hasRole } = useStore();
  if (hasRole("curator") || hasRole("admin")) return children;
  return (
    <div className={gate}>
      <h1 className="text-3xl">Curators only</h1>
      <p className="text-ink-soft">This is where the daily joke gets picked. Ask an admin if you should have access.</p>
      <Link to="/" className={button({ variant: "quiet" })}>
        Back to today
      </Link>
    </div>
  );
}
