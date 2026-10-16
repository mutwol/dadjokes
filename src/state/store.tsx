import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_DELIVERY_HOUR, ME, mySubmissions, seenDays } from "../data/mock.ts";
import type { Comment, ReactionKind, Submission } from "../data/types.ts";
import { Ctx } from "./useStore.ts";
import type { Store } from "./useStore.ts";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState(() => new Set(seenDays));
  const [reactions, setReactions] = useState<Record<string, ReactionKind>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [submissions, setSubmissions] = useState<Submission[]>(mySubmissions);
  const [deliveryHour, setDeliveryHour] = useState(DEFAULT_DELIVERY_HOUR);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const markSeen = useCallback((day: string) => {
    setSeen((prev) => (prev.has(day) ? prev : new Set(prev).add(day)));
  }, []);

  const react = useCallback((jokeId: string, kind: ReactionKind) => {
    setReactions((prev) => {
      const next = { ...prev };
      if (next[jokeId] === kind) delete next[jokeId];
      else next[jokeId] = kind;
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      seen,
      markSeen,
      myReaction: (id) => reactions[id],
      react,
      reactionsFor: (joke) => {
        const mine = reactions[joke.id];
        return mine ? { ...joke.reactions, [mine]: joke.reactions[mine] + 1 } : joke.reactions;
      },
      commentsFor: (joke) => [...(comments[joke.id] ?? []), ...joke.comments],
      addComment: (jokeId, body) =>
        setComments((prev) => ({
          ...prev,
          [jokeId]: [
            {
              id: `local-${Date.now()}`,
              author: ME.name,
              handle: ME.handle,
              body,
              postedAt: "now",
              tone: "navy",
            },
            ...(prev[jokeId] ?? []),
          ],
        })),
      submissions,
      submit: (s) =>
        setSubmissions((prev) => [
          {
            ...s,
            id: `s-${Date.now()}`,
            status: "in-review",
            submittedOn: new Date().toISOString().slice(0, 10),
          },
          ...prev,
        ]),
      deliveryHour,
      setDeliveryHour,
      toast,
      showToast,
    }),
    [seen, markSeen, reactions, react, comments, submissions, deliveryHour, toast, showToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
