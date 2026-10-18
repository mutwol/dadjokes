/*
 * The app's data layer. Import hooks from here, never from generated.ts:
 *
 *   const { data, isFetching, error } = useListAdminUsersQuery({ q, page });
 *   const [suspend, { isLoading }] = useSuspendUserMutation();
 *   await suspend({ id, suspendRequest: { reason } }).unwrap();
 *
 * Errors are always an ApiProblem (see problem.ts): `problemMessage(error)` for a
 * sentence to show, `error.fieldErrors` for a form.
 */
export { api } from "./endpoints.ts";
export * from "./generated.ts";
export { baseApi, TAG_TYPES } from "./baseApi.ts";
export type { TagType } from "./baseApi.ts";
export { onSessionExpired, serializeParams } from "./baseQuery.ts";
export { is, isApiProblem, problemMessage } from "./problem.ts";
export type { ApiProblem } from "./problem.ts";
