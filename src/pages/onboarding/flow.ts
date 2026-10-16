import { useOutletContext } from "react-router";
import type { Profile, Role } from "../../data/types.ts";

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

export const EMPTY_DRAFT: Profile = {
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
  draft: Profile;
  update: (patch: Partial<Profile>) => void;
  next: () => void;
  goTo: (step: StepId) => void;
  finish: (to: string) => void;
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
