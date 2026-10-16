import { createContext, useContext } from "react";
import type { Me, Session } from "../api/client.ts";
import type { Comment, Joke, NotificationState, ReactionKind, Role, Submission } from "../data/types.ts";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export interface Store {
  /** "loading" while an existing session is being restored on page load. */
  status: AuthStatus;
  /** The signed-in account from the API, or null. */
  account: Me | null;
  /** Stores a new session (after sign-in) and its account. */
  setSession: (session: Session) => void;
  setAccount: (me: Me) => void;
  hasRole: (r: Role) => boolean;
  /** Turns reading or writing on/off on the server. Resolves when saved. */
  setRole: (r: Role, on: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  /** Browser notification permission is per device, so it stays local. */
  notifications: NotificationState;
  setNotifications: (n: NotificationState) => void;

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
