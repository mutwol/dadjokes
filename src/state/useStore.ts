import { createContext, useContext } from "react";
import type { Comment, Joke, Profile, ReactionKind, Role, Submission } from "../data/types.ts";

export interface Store {
  /** The signed-in person, or null before onboarding is finished. */
  profile: Profile | null;
  completeOnboarding: (p: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  hasRole: (r: Role) => boolean;
  addRole: (r: Role) => void;
  removeRole: (r: Role) => void;
  signOut: () => void;

  seen: Set<string>;
  markSeen: (day: string) => void;
  myReaction: (jokeId: string) => ReactionKind | undefined;
  react: (jokeId: string, kind: ReactionKind) => void;
  reactionsFor: (joke: Joke) => Record<ReactionKind, number>;
  commentsFor: (joke: Joke) => Comment[];
  addComment: (jokeId: string, body: string) => void;
  submissions: Submission[];
  submit: (s: Omit<Submission, "id" | "status" | "submittedOn">) => void;
  deliveryHour: number;
  setDeliveryHour: (h: number) => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

export const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}
