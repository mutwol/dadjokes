import { useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { ApiError, api, errorMessage, unwrap } from "../../api/client.ts";
import { Icon } from "../../components/Icon.tsx";
import { NameTag } from "../../components/NameTag.tsx";
import { StoryCard } from "../../components/StoryCard.tsx";
import { jokeForDay, TODAY } from "../../data/mock.ts";
import type { OnboardingDraft } from "../../data/types.ts";
import { useStore } from "../../state/useStore.ts";
import { browserTimeZone, EMPTY_DRAFT, firstName, SIGN_IN_STEPS, stepsFor } from "./flow.ts";
import type { Flow, StepId } from "./flow.ts";
import "./Onboarding.css";

export function OnboardingLayout() {
  const { status, account, setAccount, setNotifications, toast } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState<Flow["saveError"]>(null);

  const current = (pathname.split("/")[2] ?? "") as StepId | "";

  if (status === "loading") return null;
  // Finished accounts never see onboarding again.
  if (account?.onboarded && !finishing) return <Navigate to="/" replace />;
  // Signed in but not finished (e.g. closed the tab halfway): resume after sign-in.
  if (account && !account.onboarded && SIGN_IN_STEPS.includes(current)) {
    return <Navigate to="/welcome/role" replace />;
  }

  const steps = stepsFor(draft.roles);
  const index = current ? steps.indexOf(current) : -1;

  const flow: Flow = {
    draft: { ...draft, email: draft.email || account?.email || "", name: draft.name || account?.name || "" },
    update: (patch) => setDraft((d) => ({ ...d, ...patch })),
    next: () => {
      const following = stepsFor(draft.roles)[index + 1];
      if (following) void navigate(`/welcome/${following}`);
    },
    goTo: (step) => void navigate(`/welcome/${step}`),
    saving,
    saveError,
    clearSaveError: () => setSaveError(null),
    finish: async (to) => {
      setSaving(true);
      setSaveError(null);
      try {
        const name = draft.name || account?.name || "";
        const me = unwrap(
          await api.POST("/v1/me/onboarding", {
            body: {
              name,
              handle: draft.handle,
              country: draft.country,
              bio: draft.bio,
              timezone: browserTimeZone(),
              roles: draft.roles,
              topics: draft.roles.includes("reader") ? draft.topics : [],
              jokeOrigin: draft.jokeOrigin,
              deliveryHour: draft.deliveryHour,
              following: draft.roles.includes("reader") ? draft.following : [],
              payout:
                draft.roles.includes("writer") && draft.payout.method === "mpesa"
                  ? { method: "mpesa", phone: draft.payout.phone }
                  : undefined,
            },
          }),
        );
        setNotifications(draft.notifications);
        setFinishing(true);
        setAccount(me);
        void navigate(to, { replace: true });
      } catch (e) {
        // Send people back to the step that needs fixing.
        if (e instanceof ApiError && e.code === "handle_taken") {
          setSaveError({ step: "profile", message: e.problem.title });
          void navigate("/welcome/profile");
        } else if (e instanceof ApiError && e.code === "already_onboarded") {
          setFinishing(false);
          void navigate("/", { replace: true });
        } else {
          setSaveError({ step: "done", message: errorMessage(e) });
        }
      } finally {
        setSaving(false);
      }
    },
  };

  const sample = jokeForDay(TODAY);
  const name = firstName(flow.draft.name);
  // Once signed in, going back from the first post-sign-in step makes no sense.
  const backTarget = index > 0 && !(account && steps[index - 1] === "verify") ? `/welcome/${steps[index - 1]}` : null;

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
            {backTarget || index === 0 ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => void navigate(backTarget ?? "/welcome")}
                aria-label="Back"
              >
                <Icon name="back" />
              </button>
            ) : (
              <span className="icon-btn" aria-hidden="true" />
            )}
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
