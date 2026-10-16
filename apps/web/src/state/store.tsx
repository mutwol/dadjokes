import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, errorMessage, refreshAccessToken, setAccessToken, unwrap } from "../api/client.ts";
import type { Me, Session } from "../api/client.ts";
import { DEFAULT_DELIVERY_HOUR, seenDays } from "../data/mock.ts";
import type { Comment, NotificationState, ReactionKind, Role } from "../data/types.ts";
import { Ctx } from "./useStore.ts";
import type { AuthStatus, Store } from "./useStore.ts";

const NOTIFY_KEY = "daddyjokes.notifications";

function loadNotifications(): NotificationState {
  try {
    const v = window.localStorage.getItem(NOTIFY_KEY);
    return v === "on" || v === "denied" || v === "unsupported" ? v : "off";
  } catch {
    return "off";
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [account, setAccountState] = useState<Me | null>(null);
  const [notifications, setNotificationsState] = useState<NotificationState>(loadNotifications);
  const [seen, setSeen] = useState(() => new Set(seenDays));
  const [reactions, setReactions] = useState<Record<string, ReactionKind>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        setStatus("signed-out");
        return;
      }
      const res = await api.GET("/v1/me");
      if (cancelled) return;
      if (res.data) {
        setAccountState(res.data);
        setStatus("signed-in");
      } else {
        setStatus("signed-out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const setAccount = useCallback((me: Me) => {
    setAccountState(me);
    setStatus("signed-in");
  }, []);

  const setSession = useCallback(
    (session: Session) => {
      setAccessToken(session.accessToken);
      setAccount(session.user);
    },
    [setAccount],
  );

  const setRole = useCallback(
    async (r: Role, on: boolean) => {
      if (!account) return;
      const current = account.roles.filter((x): x is Role => x === "reader" || x === "writer");
      const roles = on ? [...new Set([...current, r])] : current.filter((x) => x !== r);
      try {
        setAccount(unwrap(await api.PUT("/v1/me/roles", { body: { roles } })));
      } catch (e) {
        showToast(errorMessage(e));
        throw e;
      }
    },
    [account, setAccount, showToast],
  );

  const setDeliveryHour = useCallback(
    (h: number) => {
      if (!account) return;
      // Optimistic: the picker updates at once, and rolls back if saving fails.
      const previous = account;
      setAccountState({ ...account, preferences: { ...account.preferences, deliveryHour: h } });
      void api.PATCH("/v1/me/preferences", { body: { deliveryHour: h } }).then((res) => {
        if (res.data) setAccountState(res.data);
        else {
          setAccountState(previous);
          showToast(errorMessage(undefined, "Couldn't save the delivery time. Try again."));
        }
      });
    },
    [account, showToast],
  );

  const signOut = useCallback(async () => {
    await api.POST("/v1/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setAccountState(null);
    setStatus("signed-out");
  }, []);

  const setNotifications = useCallback((n: NotificationState) => {
    setNotificationsState(n);
    try {
      window.localStorage.setItem(NOTIFY_KEY, n);
    } catch {
      // Storage unavailable: the setting lasts for this visit only.
    }
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
      status,
      account,
      setSession,
      setAccount,
      hasRole: (r) => account?.roles.includes(r) ?? false,
      setRole,
      signOut,
      notifications,
      setNotifications,

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
              author: account?.name ?? "You",
              handle: account?.handle ?? "you",
              body,
              postedAt: "now",
              tone: account?.tone ?? "navy",
            },
            ...(prev[jokeId] ?? []),
          ],
        })),
      deliveryHour: account?.preferences.deliveryHour ?? DEFAULT_DELIVERY_HOUR,
      setDeliveryHour,
      toast,
      showToast,
    }),
    [
      status,
      account,
      setSession,
      setAccount,
      setRole,
      signOut,
      notifications,
      setNotifications,
      seen,
      markSeen,
      reactions,
      react,
      comments,
      setDeliveryHour,
      toast,
      showToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
