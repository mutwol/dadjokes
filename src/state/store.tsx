import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_DELIVERY_HOUR, mySubmissions, seenDays } from "../data/mock.ts";
import type { Comment, Profile, ReactionKind, Role, Submission } from "../data/types.ts";
import { Ctx } from "./useStore.ts";
import type { Store } from "./useStore.ts";

const PROFILE_KEY = "daddyjokes.profile";

/**
 * The profile is kept in localStorage so a reload doesn't restart onboarding.
 * Storage can be unavailable (private mode, blocked site data), so every access
 * is guarded and the app still works without it.
 */
function loadProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function saveProfile(p: Profile | null) {
  try {
    if (p) window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Storage unavailable: the profile lives in memory for this visit only.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [seen, setSeen] = useState(() => new Set(seenDays));
  const [reactions, setReactions] = useState<Record<string, ReactionKind>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [submissions, setSubmissions] = useState<Submission[]>(mySubmissions);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveProfile(profile), [profile]);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
  }, []);

  const setRoles = useCallback((fn: (roles: Role[]) => Role[]) => {
    setProfile((p) => (p ? { ...p, roles: fn(p.roles) } : p));
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
      profile,
      completeOnboarding: setProfile,
      updateProfile,
      hasRole: (r) => profile?.roles.includes(r) ?? false,
      addRole: (r) => setRoles((roles) => (roles.includes(r) ? roles : [...roles, r])),
      // A person always keeps at least one role.
      removeRole: (r) => setRoles((roles) => (roles.length > 1 ? roles.filter((x) => x !== r) : roles)),
      signOut: () => setProfile(null),

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
              author: profile?.name ?? "You",
              handle: profile?.handle ?? "you",
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
      deliveryHour: profile?.deliveryHour ?? DEFAULT_DELIVERY_HOUR,
      setDeliveryHour: (h) => updateProfile({ deliveryHour: h }),
      toast,
      showToast,
    }),
    [profile, updateProfile, setRoles, seen, markSeen, reactions, react, comments, submissions, toast, showToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
