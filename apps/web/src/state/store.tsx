import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api as fetchApi, refreshAccessToken, setAccessToken } from "../api/client.ts";
import { syncPush } from "../api/push.ts";
import { api, problemMessage, useGetMeQuery, useListActivityQuery, useReplaceMyRolesMutation, useUpdateMyPreferencesMutation } from "../api/rtk/index.ts";
import type { Me, Session } from "../api/rtk/index.ts";
import { onSessionExpired } from "../api/rtk/baseQuery.ts";
import type { NotificationState, Role } from "../data/types.ts";
import { onApiProblem, resetApiCache, useAppDispatch } from "./redux.ts";
import { toast } from "@/components/ui/toast.tsx";
import { Ctx } from "./useStore.ts";
import type { AuthStatus, Store } from "./useStore.ts";

const NOTIFY_KEY = "daddyjokes.notifications";
const DEFAULT_DELIVERY_HOUR = 8;
/** The unread badge reads the newest activity item only; its count comes with it. */
const UNREAD_ARG = { limit: 1 } as const;

function loadNotifications(): NotificationState {
  try {
    const v = window.localStorage.getItem(NOTIFY_KEY);
    return v === "on" || v === "denied" || v === "unsupported" ? v : "off";
  } catch {
    return "off";
  }
}

/**
 * Session and app-wide UI state. Server data (the account, the unread count) lives in
 * the RTK Query cache; this provider decides when it's fetched and exposes it with the
 * same `useStore()` shape the screens already use.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notifications, setNotificationsState] = useState<NotificationState>(loadNotifications);
  const signedIn = status === "signed-in";

  // The account is the cached getMe; mutations that return Me keep it current (endpoints.ts).
  const { data: account = null } = useGetMeQuery(undefined, { skip: !signedIn });
  // Unread badge: refreshed every minute and when the tab regains focus.
  const { data: activity } = useListActivityQuery(UNREAD_ARG, {
    skip: !signedIn,
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
  });
  const unread = signedIn ? (activity?.unread ?? 0) : 0;
  const [replaceRoles] = useReplaceMyRolesMutation();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) return setStatus("signed-out");
      const me = await dispatch(api.endpoints.getMe.initiate(undefined, { subscribe: false })).unwrap().catch(() => null);
      if (!cancelled) setStatus(me ? "signed-in" : "signed-out");
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Once signed in: keep this browser's push subscription in sync.
  useEffect(() => {
    if (signedIn && loadNotifications() === "on") void syncPush().catch(() => undefined);
  }, [signedIn]);

  const setAccount = useCallback(
    (me: Me) => {
      dispatch(api.util.upsertQueryData("getMe", undefined, me));
      setStatus("signed-in");
    },
    [dispatch],
  );

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
        await replaceRoles({ replaceRolesRequest: { roles } }).unwrap();
      } catch (e) {
        toast.error(problemMessage(e));
        throw e;
      }
    },
    [account, replaceRoles],
  );

  // Optimistic in the cache, rolled back if saving fails (endpoints.ts).
  const setDeliveryHour = useCallback(
    (h: number) => {
      updatePreferences({ updatePreferencesRequest: { deliveryHour: h } })
        .unwrap()
        .catch(() => toast.error("Couldn't save the delivery time. Try again."));
    },
    [updatePreferences],
  );

  const endSession = useCallback(() => {
    setAccessToken(null);
    setStatus("signed-out");
    resetApiCache();
  }, []);

  const signOut = useCallback(async () => {
    // Logout stays on the fetch client: it ends the cookie session the RTK base query relies on.
    await fetchApi.POST("/v1/auth/logout").catch(() => undefined);
    endSession();
  }, [endSession]);

  // A refresh that fails mid-session signs out; 403s and server errors no screen handles get a toast.
  useEffect(() => {
    onSessionExpired(endSession);
    const off = onApiProblem((p) => toast.error(p.status === 403 ? "You no longer have access to that." : p.title));
    return () => {
      onSessionExpired(null);
      off();
    };
  }, [endSession]);

  const setNotifications = useCallback((n: NotificationState) => {
    setNotificationsState(n);
    try {
      window.localStorage.setItem(NOTIFY_KEY, n);
    } catch {
      // Storage unavailable: the setting lasts for this visit only.
    }
  }, []);

  // Safe from any component at any time: `refetch()` throws if the query hasn't started yet
  // (child effects run before this provider's), so dispatch a forced fetch instead.
  const refreshUnread = useCallback(() => {
    if (signedIn) void dispatch(api.endpoints.listActivity.initiate(UNREAD_ARG, { subscribe: false, forceRefetch: true }));
  }, [signedIn, dispatch]);

  const clearUnread = useCallback(() => {
    dispatch(api.util.updateQueryData("listActivity", UNREAD_ARG, (d) => void (d.unread = 0)));
  }, [dispatch]);

  const value = useMemo<Store>(
    () => ({
      status,
      account: signedIn ? account : null,
      setSession,
      setAccount,
      hasRole: (r) => (signedIn && account?.roles.includes(r)) ?? false,
      setRole,
      signOut,
      notifications,
      setNotifications,
      deliveryHour: account?.preferences.deliveryHour ?? DEFAULT_DELIVERY_HOUR,
      setDeliveryHour,
      unread,
      refreshUnread,
      clearUnread,
    }),
    [status, signedIn, account, setSession, setAccount, setRole, signOut, notifications, setNotifications, setDeliveryHour, unread, refreshUnread, clearUnread],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
