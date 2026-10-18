import { configureStore, createListenerMiddleware, isRejectedWithValue } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { useDispatch, useSelector, useStore } from "react-redux";
import { api } from "../api/rtk/endpoints.ts";
import { baseApi } from "../api/rtk/baseApi.ts";
import { isApiProblem } from "../api/rtk/problem.ts";
import type { ApiProblem } from "../api/rtk/problem.ts";

/**
 * Errors every screen would otherwise handle the same way are reported once, here:
 * a 403 (lost a role mid-session) or a 5xx on a background refetch. Subscribers (the
 * toast in StoreProvider) decide how to show them. Validation errors (422) and 404s
 * belong to the screen that made the call, so they're left alone.
 */
type ProblemListener = (problem: ApiProblem, endpoint: string) => void;
const problemListeners = new Set<ProblemListener>();
export function onApiProblem(l: ProblemListener) {
  problemListeners.add(l);
  return () => problemListeners.delete(l);
}

const listener = createListenerMiddleware();
listener.startListening({
  matcher: isRejectedWithValue,
  effect: (action) => {
    const problem = action.payload;
    if (!isApiProblem(problem)) return;
    const endpoint = (action.meta as { arg?: { endpointName?: string } }).arg?.endpointName ?? "";
    const global = problem.status === 403 || (typeof problem.status === "number" && problem.status >= 500);
    if (global) problemListeners.forEach((l) => l(problem, endpoint));
    if (import.meta.env.DEV) console.warn(`[api] ${endpoint} failed`, problem);
  },
});

export function makeStore() {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().prepend(listener.middleware).concat(baseApi.middleware),
    devTools: import.meta.env.DEV,
  });
  // refetchOnFocus / refetchOnReconnect for queries that opt in.
  setupListeners(store.dispatch);
  return store;
}

export const store = makeStore();

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

/** Drops every cached response, e.g. on sign-out so the next person sees nothing stale. */
export function resetApiCache() {
  store.dispatch(api.util.resetApiState());
}
