import { useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Icon } from "../../components/Icon.tsx";
import { NameTag } from "../../components/NameTag.tsx";
import { StoryCard } from "../../components/StoryCard.tsx";
import { jokeForDay, TODAY } from "../../data/mock.ts";
import type { Profile } from "../../data/types.ts";
import { useStore } from "../../state/useStore.ts";
import { EMPTY_DRAFT, firstName, stepsFor } from "./flow.ts";
import type { Flow, StepId } from "./flow.ts";
import "./Onboarding.css";

export function OnboardingLayout() {
  const { profile, completeOnboarding, toast } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [draft, setDraft] = useState<Profile>(EMPTY_DRAFT);
  const [finishing, setFinishing] = useState(false);

  // People who are already signed in skip onboarding.
  if (profile && !finishing) return <Navigate to="/" replace />;

  const current = (pathname.split("/")[2] ?? "") as StepId | "";
  const steps = stepsFor(draft.roles);
  const index = current ? steps.indexOf(current) : -1;

  const flow: Flow = {
    draft,
    update: (patch) => setDraft((d) => ({ ...d, ...patch })),
    next: () => {
      const following = stepsFor(draft.roles)[index + 1];
      if (following) void navigate(`/welcome/${following}`);
    },
    goTo: (step) => void navigate(`/welcome/${step}`),
    finish: (to) => {
      setFinishing(true);
      completeOnboarding(draft);
      void navigate(to, { replace: true });
    },
  };

  const sample = jokeForDay(TODAY);
  const name = firstName(draft.name);

  return (
    <div className="ob">
      <aside className="ob-art story-bg-red" aria-hidden="true">
        {current === "" && sample ? (
          <div className="ob-art-sample">
            <StoryCard face={sample} revealed variant="card" />
          </div>
        ) : (
          <div className="ob-art-tag">
            <NameTag name={name || "…"} size="l" tilt={-6} />
            <p>{name ? `Hi ${name}, I'm Dad.` : "Every dad joke starts with an introduction."}</p>
          </div>
        )}
      </aside>

      <main className="ob-main">
        {current !== "" && current !== "done" ? (
          <header className="ob-top">
            <button
              type="button"
              className="icon-btn"
              onClick={() => void navigate(index > 0 ? `/welcome/${steps[index - 1]}` : "/welcome")}
              aria-label="Back"
            >
              <Icon name="back" />
            </button>
            <div
              className="ob-progress"
              role="progressbar"
              aria-label="Sign-up progress"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={index + 1}
              aria-valuetext={`Step ${index + 1} of ${steps.length}`}
            >
              <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
            </div>
          </header>
        ) : null}
        <div className="ob-body">
          <Outlet context={flow} />
        </div>
      </main>

      {toast ? (
        <div className="toast toast-bottom" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
