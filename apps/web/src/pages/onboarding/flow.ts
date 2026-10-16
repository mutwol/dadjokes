import { useOutletContext } from "react-router";
import type { OnboardingDraft, Role } from "../../data/types.ts";

export type StepId =
  | "email"
  | "verify"
  | "role"
  | "profile"
  | "topics"
  | "follow"
  | "delivery"
  | "payouts"
  | "done";

/**
 * The steps after the welcome screen. Shared steps first, then reader steps
 * (what to get and when), then writer steps (how to get paid).
 */
export function stepsFor(roles: Role[]): StepId[] {
  const steps: StepId[] = ["email", "verify", "role", "profile"];
  if (roles.includes("reader")) steps.push("topics", "follow", "delivery");
  if (roles.includes("writer")) steps.push("payouts");
  steps.push("done");
  return steps;
}

/** Steps that come before an account exists. Signed-in people skip them. */
export const SIGN_IN_STEPS: (StepId | "")[] = ["", "email", "verify"];

export const EMPTY_DRAFT: OnboardingDraft = {
  email: "",
  name: "",
  handle: "",
  country: "Kenya",
  bio: "",
  roles: [],
  topics: [],
  jokeOrigin: "everywhere",
  following: [],
  deliveryHour: 8,
  notifications: "off",
  payout: { method: "later" },
};

export interface Flow {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  next: () => void;
  goTo: (step: StepId) => void;
  /** Saves the draft to the API, then navigates to `to`. */
  finish: (to: string) => Promise<void>;
  saving: boolean;
  /** Set when saving failed, so the step that needs fixing can show it. */
  saveError: { step: StepId; message: string } | null;
  clearSaveError: () => void;
}

export function useFlow(): Flow {
  return useOutletContext<Flow>();
}

export function handleFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** The reader's IANA time zone, which decides when their joke arrives. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
