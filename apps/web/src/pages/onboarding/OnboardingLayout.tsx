import { useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { is, problemMessage, useCompleteOnboardingMutation } from "../../api/rtk/index.ts";
import { IconButton } from "@/components/ui/button.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { NameTag } from "../../components/NameTag.tsx";
import { StoryCard } from "../../components/StoryCard.tsx";
import { SAMPLE_JOKE } from "../../data/sample.ts";
import type { OnboardingDraft } from "../../data/types.ts";
import { useStore } from "../../state/useStore.ts";
import { browserTimeZone, EMPTY_DRAFT, firstName, SIGN_IN_STEPS, stepsFor } from "./flow.ts";
import type { Flow, StepId } from "./flow.ts";

export function OnboardingLayout() {
  const { status, account, setAccount, setNotifications } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [completeOnboarding] = useCompleteOnboardingMutation();
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
        const me = await completeOnboarding({
          completeOnboardingRequest: {
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
        }).unwrap();
        setNotifications(draft.notifications);
        setFinishing(true);
        setAccount(me);
        void navigate(to, { replace: true });
      } catch (e) {
        // Send people back to the step that needs fixing.
        if (is(e, "handle_taken")) {
          setSaveError({ step: "profile", message: problemMessage(e) });
          void navigate("/welcome/profile");
        } else if (is(e, "already_onboarded")) {
          setFinishing(false);
          void navigate("/", { replace: true });
        } else {
          setSaveError({ step: "done", message: problemMessage(e) });
        }
      } finally {
        setSaving(false);
      }
    },
  };

  const sample = SAMPLE_JOKE;
  const name = firstName(flow.draft.name);
  // Once signed in, going back from the first post-sign-in step makes no sense.
  const backTarget = index > 0 && !(account && steps[index - 1] === "verify") ? `/welcome/${steps[index - 1]}` : null;

  return (
    <div className="min-h-dvh bg-fridge lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Desktop: the sticker panel on the left, the form on the right. */}
      <aside
        className="sticky top-0 hidden h-dvh place-items-center bg-tag-red p-12 text-white lg:grid"
        aria-hidden="true"
      >
        {current === "" && sample ? (
          <div className="w-[min(340px,80%)] -rotate-3 rounded-3xl shadow-lift outline-6 outline-white/90">
            <StoryCard face={sample} revealed variant="card" />
          </div>
        ) : (
          <div className="grid justify-items-center gap-7 text-center">
            <NameTag name={name || "…"} size="l" tilt={-6} className="scale-160" />
            <p className="mt-6 max-w-[16ch] font-marker text-2xl">{name ? `Hi ${name}, I'm Dad.` : "Every dad joke starts with an introduction."}</p>
          </div>
        )}
      </aside>

      <main className="mx-auto max-w-onboarding px-4 pb-[calc(32px+env(safe-area-inset-bottom))] lg:w-full lg:max-w-form lg:px-12 lg:pb-12">
        {current !== "" && current !== "done" ? (
          <header className="sticky top-0 z-5 -ml-2.5 flex items-center gap-2 bg-fridge py-2.5 lg:pt-7">
            {backTarget || index === 0 ? (
              <IconButton onClick={() => void navigate(backTarget ?? "/welcome")} aria-label="Back">
                <Icon name="back" />
              </IconButton>
            ) : (
              <span className="size-11" aria-hidden="true" />
            )}
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="Sign-up progress"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={index + 1}
              aria-valuetext={`Step ${index + 1} of ${steps.length}`}
            >
              <span
                className="block h-full rounded-[inherit] bg-tag-red transition-[width] duration-320 ease-out"
                style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
            </div>
          </header>
        ) : null}
        <div className="pt-4 lg:pt-6">
          <Outlet context={flow} />
        </div>
      </main>

    </div>
  );
}
