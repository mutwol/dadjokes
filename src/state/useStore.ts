import { createContext, useContext } from "react";
import type { Comment, Joke, ReactionKind, Submission } from "../data/types.ts";

export interface Store {
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
