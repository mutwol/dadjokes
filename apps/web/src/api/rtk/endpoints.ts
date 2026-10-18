import { generatedApi } from "./generated.ts";
import type { AdminUserDetail, Me, RuleSetDetail, WorkflowDetail } from "./generated.ts";
import { LIST, item, itemAndList, list, onSuccess, tags } from "./tags.ts";

/**
 * Cache behaviour for every generated endpoint, in one place.
 *
 * - providesTags: what a query's data depends on.
 * - invalidatesTags: what a mutation makes stale. Lists refetch only when needed.
 * - onQueryStarted: writes that return the updated entity put it straight into the
 *   cache (no refetch round-trip); preference changes are optimistic and roll back.
 *
 * When the API gains an endpoint, run `pnpm --filter web api:generate`, then give it a
 * line here. Endpoints without one still work; they just don't share cache.
 */

/** Mutations that return the fresh `Me`: write it into getMe. */
const putMe = {
  async onQueryStarted(_arg: unknown, { dispatch, queryFulfilled }: { dispatch: AppDispatchLike; queryFulfilled: Promise<{ data: Me }> }) {
    try {
      const { data } = await queryFulfilled;
      dispatch(generatedApi.util.upsertQueryData("getMe", undefined, data));
    } catch {
      /* the error reaches the caller */
    }
  },
};

/** Admin user mutations that return the fresh detail: write it into getAdminUser(id). */
const putAdminUser = {
  async onQueryStarted(
    { id }: { id: string },
    { dispatch, queryFulfilled }: { dispatch: AppDispatchLike; queryFulfilled: Promise<{ data: AdminUserDetail }> },
  ) {
    try {
      const { data } = await queryFulfilled;
      dispatch(generatedApi.util.upsertQueryData("getAdminUser", { id }, data));
    } catch {
      /* the error reaches the caller */
    }
  },
};

/** The thunk dispatch the lifecycle API hands us (the store's type isn't known here). */
type AppDispatchLike = (action: unknown) => unknown;

/** Rule-set writes return the fresh detail: put it in getRuleSet(id) instead of refetching. */
const putRuleSet = {
  async onQueryStarted({ id }: { id: string }, { dispatch, queryFulfilled }: { dispatch: AppDispatchLike; queryFulfilled: Promise<{ data: RuleSetDetail }> }) {
    try {
      const { data } = await queryFulfilled;
      dispatch(generatedApi.util.upsertQueryData("getRuleSet", { id }, data));
    } catch {
      /* the error reaches the caller */
    }
  },
};

/** Workflow writes return the fresh detail: put it in getWorkflow(id) instead of refetching. */
const putWorkflow = {
  async onQueryStarted({ id }: { id: string }, { dispatch, queryFulfilled }: { dispatch: AppDispatchLike; queryFulfilled: Promise<{ data: WorkflowDetail }> }) {
    try {
      const { data } = await queryFulfilled;
      dispatch(generatedApi.util.upsertQueryData("getWorkflow", { id }, data));
    } catch {
      /* the error reaches the caller */
    }
  },
};

type ReactionKind = "laugh" | "groan" | "facepalm" | "drum";

/**
 * Optimistic subscribe/unsubscribe: flips `isSubscribed` and the subscriber count in
 * every cached creator list and profile that shows this writer, and undoes it on failure.
 */
function subscriptionLifecycle(subscribed: boolean) {
  return {
    async onQueryStarted(
      { creatorId }: { creatorId: string },
      { dispatch, getState, queryFulfilled }: { dispatch: AppDispatchLike; getState: () => unknown; queryFulfilled: Promise<unknown> },
    ) {
      const patches: { undo: () => void }[] = [];
      const flip = <T extends { id: string; isSubscribed: boolean; subscriberCount: number }>(c: T) => {
        if (c.id !== creatorId || c.isSubscribed === subscribed) return;
        c.isSubscribed = subscribed;
        c.subscriberCount += subscribed ? 1 : -1;
      };
      for (const entry of generatedApi.util.selectInvalidatedBy(getState() as never, [{ type: "Creator", id: creatorId }, { type: "Creator", id: LIST }])) {
        if (entry.endpointName === "listCreators")
          patches.push(dispatch(generatedApi.util.updateQueryData("listCreators", entry.originalArgs, (d) => d.data.forEach(flip))) as { undo: () => void });
        if (entry.endpointName === "getCreator")
          patches.push(dispatch(generatedApi.util.updateQueryData("getCreator", entry.originalArgs, (d) => flip(d as never))) as { undo: () => void });
      }
      try {
        await queryFulfilled;
      } catch {
        patches.forEach((p) => p.undo());
      }
    },
  };
}

/**
 * Optimistic reactions: the count and "my reaction" on a cached joke change at once;
 * the server's numbers replace them when the call returns, or the change is undone.
 */
function reactionLifecycle(next: (arg: { id: string; reactRequest?: { kind: ReactionKind } }) => ReactionKind | null) {
  return {
    async onQueryStarted(
      arg: { id: string; reactRequest?: { kind: ReactionKind } },
      { dispatch, queryFulfilled }: { dispatch: AppDispatchLike; queryFulfilled: Promise<{ data: { reactions: Record<ReactionKind, number>; myReaction: ReactionKind | null; views: number; comments: number } }> },
    ) {
      const mine = next(arg);
      const patch = dispatch(
        generatedApi.util.updateQueryData("getJoke", { id: arg.id }, (j) => {
          if (j.myReaction) j.stats.reactions[j.myReaction] = Math.max(0, j.stats.reactions[j.myReaction] - 1);
          if (mine) j.stats.reactions[mine] += 1;
          j.myReaction = mine;
        }),
      ) as { undo: () => void };
      try {
        const { data } = await queryFulfilled;
        dispatch(
          generatedApi.util.updateQueryData("getJoke", { id: arg.id }, (j) => {
            j.stats = { views: data.views, reactions: data.reactions, comments: data.comments };
            j.myReaction = data.myReaction;
          }),
        );
      } catch {
        patch.undo();
      }
    },
  };
}

/** Applies `edit` to every cached comment page that contains comment `id`. */
function patchCommentPages(
  dispatch: AppDispatchLike,
  getState: () => unknown,
  id: string,
  edit: (page: { data: { id: string; hidden?: boolean }[] }) => void,
): { undo: () => void }[] {
  return generatedApi.util
    .selectInvalidatedBy(getState() as never, [{ type: "Comment", id }])
    .filter((e) => e.endpointName === "listComments")
    .map((e) => dispatch(generatedApi.util.updateQueryData("listComments", e.originalArgs, edit as never)) as { undo: () => void });
}

/** A curated joke left the queue (scheduled or declined): drop it from every cached queue page. */
function leaveQueue() {
  return {
    async onQueryStarted({ id }: { id: string }, { dispatch, getState, queryFulfilled }: { dispatch: AppDispatchLike; getState: () => unknown; queryFulfilled: Promise<unknown> }) {
      try {
        await queryFulfilled;
        for (const e of generatedApi.util.selectInvalidatedBy(getState() as never, ["ReviewQueue"]))
          if (e.endpointName === "getReviewQueue")
            dispatch(
              generatedApi.util.updateQueryData("getReviewQueue", e.originalArgs, (q) => {
                const before = q.data.length;
                q.data = q.data.filter((i) => i.joke.id !== id);
                q.waiting = Math.max(0, q.waiting - (before - q.data.length));
              }),
            );
      } catch {
        /* the error reaches the caller */
      }
    },
  };
}

export const api = generatedApi.enhanceEndpoints({
  endpoints: {
    // ---------------------------------------------------------------- Me & activity
    getMe: { providesTags: tags("Me") },
    updateMe: { invalidatesTags: onSuccess({ type: "Creator", id: LIST }), ...putMe },
    completeOnboarding: { invalidatesTags: onSuccess("Today", "Studio"), ...putMe },
    replaceMyRoles: { invalidatesTags: onSuccess("Studio"), ...putMe },
    updateMyPreferences: {
      invalidatesTags: onSuccess("Today"),
      // Optimistic: the setting changes at once and rolls back if saving fails.
      async onQueryStarted({ updatePreferencesRequest }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          generatedApi.util.updateQueryData("getMe", undefined, (me) => {
            Object.assign(me.preferences, updatePreferencesRequest);
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(generatedApi.util.upsertQueryData("getMe", undefined, data));
        } catch {
          patch.undo();
        }
      },
    },
    setMyPayoutMethod: { invalidatesTags: onSuccess("Balance"), ...putMe },
    removeMyPayoutMethod: { invalidatesTags: onSuccess("Balance", "Me") },
    listActivity: {
      providesTags: list("Activity"),
      // "Show older": one cache entry per page size; pages fetched with a cursor append.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.limit ?? ""})`,
      merge: (cache, page, { arg }) => {
        if (!arg.cursor) return page;
        const seen = new Set(cache.data.map((a) => a.id));
        cache.data.push(...page.data.filter((a) => !seen.has(a.id)));
        cache.nextCursor = page.nextCursor;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
    },
    // Marking read doesn't refetch the list: it keeps showing what was new until next visit.
    markActivityRead: {},
    getPushConfig: { providesTags: tags("Push") },
    addPushSubscription: { invalidatesTags: onSuccess("Push") },
    removePushSubscription: { invalidatesTags: onSuccess("Push") },

    // ------------------------------------------------------------ Discovery
    listTopics: { providesTags: tags("Topic"), keepUnusedDataFor: 3600 },
    listCreators: { providesTags: list("Creator") },
    getCreator: { providesTags: item("Creator", "handle") },
    listMySubscriptions: { providesTags: list("Subscription") },
    subscribe: { invalidatesTags: onSuccess({ type: "Subscription", id: LIST }, "Today"), ...subscriptionLifecycle(true) },
    unsubscribe: { invalidatesTags: onSuccess({ type: "Subscription", id: LIST }, "Today"), ...subscriptionLifecycle(false) },
    getLanding: { providesTags: tags("Landing"), keepUnusedDataFor: 600 },

    // ------------------------------------------------------------ Writing
    listMyJokes: {
      providesTags: list("MyJoke"),
      // "Show more": one cache entry per status filter; pages fetched with a cursor append.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.status ?? ""}|${queryArgs.limit ?? ""})`,
      merge: (cache, page, { arg }) => {
        if (!arg.cursor) return page;
        const seen = new Set(cache.data.map((j) => j.id));
        cache.data.push(...page.data.filter((j) => !seen.has(j.id)));
        cache.nextCursor = page.nextCursor;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
    },
    getMyJoke: { providesTags: item("MyJoke") },
    submitJoke: { invalidatesTags: onSuccess({ type: "MyJoke", id: LIST }, "Studio", "ReviewQueue") },
    withdrawMyJoke: {
      // Patch the withdrawn joke in place in every cached list (keeps loaded pages), refresh the counts.
      invalidatesTags: onSuccess("Studio", "ReviewQueue"),
      async onQueryStarted({ id }, { dispatch, getState, queryFulfilled }) {
        try {
          const { data: updated } = await queryFulfilled;
          for (const e of generatedApi.util.selectInvalidatedBy(getState() as never, [{ type: "MyJoke", id }]))
            if (e.endpointName === "listMyJokes")
              dispatch(generatedApi.util.updateQueryData("listMyJokes", e.originalArgs, (page) => void (page.data = page.data.map((j) => (j.id === id ? updated : j)))));
          dispatch(generatedApi.util.upsertQueryData("getMyJoke", { id }, updated));
        } catch {
          /* the error reaches the caller */
        }
      },
    },
    getStudioSummary: { providesTags: tags("Studio") },
    getStudioDaily: { providesTags: tags("Studio") },
    appealJoke: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "MyJoke", id: a.id }, { type: "Appeal", id: LIST }]) },
    listMyAppeals: { providesTags: list("Appeal") },

    // ------------------------------------------------------------ Reading
    getToday: { providesTags: tags("Today") },
    openDelivery: { invalidatesTags: onSuccess("Today") },
    getJoke: { providesTags: item("Joke") },
    // Reactions patch the cached joke (see reactionLifecycle) instead of refetching it.
    react: { ...reactionLifecycle((a) => a.reactRequest?.kind ?? null) },
    unreact: { ...reactionLifecycle(() => null) },
    listComments: {
      providesTags: (r, _e, a) => [...list("Comment")(r), { type: "Comment", id: `joke:${a.id}` }],
      // "Older comments": one cache entry per joke; pages fetched with a cursor append.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.id}|${queryArgs.limit ?? ""})`,
      merge: (cache, page, { arg }) => {
        if (!arg.cursor) return page;
        const seen = new Set(cache.data.map((c) => c.id));
        cache.data.push(...page.data.filter((c) => !seen.has(c.id)));
        cache.nextCursor = page.nextCursor;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
    },
    addComment: {
      // The new comment goes straight to the top of the list, and the count goes up.
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data: comment } = await queryFulfilled;
          dispatch(generatedApi.util.updateQueryData("listComments", { id, limit: 20 }, (page) => void page.data.unshift(comment)));
          dispatch(generatedApi.util.updateQueryData("getJoke", { id }, (j) => void (j.stats.comments += 1)));
        } catch {
          /* the error reaches the caller */
        }
      },
    },
    deleteComment: {
      async onQueryStarted({ id }, { dispatch, getState, queryFulfilled }) {
        const patches = patchCommentPages(dispatch, getState, id, (page) => {
          page.data = page.data.filter((c) => c.id !== id);
        });
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => p.undo());
        }
      },
    },
    liveStats: { providesTags: item("Joke") },

    // ------------------------------------------------------------ Money
    tipJoke: { invalidatesTags: onSuccess("Balance", "Studio") },
    getTip: { providesTags: item("Tip") },
    // Test mode: answering the simulated prompt settles the tip, so its status refreshes.
    simulateTipPrompt: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "Tip", id: a.id }, { type: "TipWall" }, "Balance"]) },
    // The tip wall under a joke. A tip landing (or a message being hidden) refreshes it.
    listJokeTips: { providesTags: item("TipWall") },
    setTipNoteHidden: { invalidatesTags: onSuccess("TipWall") },
    getBalance: { providesTags: tags("Balance") },
    listPayouts: { providesTags: list("Payout") },
    requestPayout: { invalidatesTags: onSuccess("Balance", { type: "Payout", id: LIST }) },

    // ------------------------------------------------------------ Curation & moderation
    getReviewQueue: {
      providesTags: (r) => [...list("CuratedJoke")(r), "ReviewQueue"],
      // "Show more": one cache entry per page size; pages fetched with a cursor append.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.limit ?? ""})`,
      merge: (cache, page, { arg }) => {
        if (!arg.cursor) return page;
        const seen = new Set(cache.data.map((i) => i.joke.id));
        cache.data.push(...page.data.filter((i) => !seen.has(i.joke.id)));
        cache.nextCursor = page.nextCursor;
        cache.waiting = page.waiting;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
    },
    getCurationCalendar: { providesTags: tags("Calendar") },
    getCuratedJoke: { providesTags: item("CuratedJoke") },
    // Both drop the joke from the loaded queue in place (keeping later pages) and refresh the calendar.
    scheduleJoke: { invalidatesTags: (_r, e) => (e ? [] : ["Calendar"]), ...leaveQueue() },
    declineJoke: { ...leaveQueue() },
    listReports: { providesTags: tags({ type: "Report", id: LIST }) },
    resolveReports: { invalidatesTags: onSuccess({ type: "Report", id: LIST }, { type: "Comment", id: LIST }) },
    hideComment: {
      invalidatesTags: onSuccess({ type: "Report", id: LIST }),
      async onQueryStarted({ id }, { dispatch, getState, queryFulfilled }) {
        const patches = patchCommentPages(dispatch, getState, id, (page) => page.data.forEach((c) => c.id === id && (c.hidden = true)));
        await queryFulfilled.catch(() => patches.forEach((p) => p.undo()));
      },
    },
    unhideComment: {
      invalidatesTags: onSuccess({ type: "Report", id: LIST }),
      async onQueryStarted({ id }, { dispatch, getState, queryFulfilled }) {
        const patches = patchCommentPages(dispatch, getState, id, (page) => page.data.forEach((c) => c.id === id && (c.hidden = false)));
        await queryFulfilled.catch(() => patches.forEach((p) => p.undo()));
      },
    },
    listAppeals: { providesTags: list("Appeal") },
    resolveAppeal: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "Appeal", id: a.id }, { type: "Appeal", id: LIST }, "ReviewQueue"]) },

    // ------------------------------------------------------------ Admin: rules
    listDecisionPoints: { providesTags: tags("DecisionPoint"), keepUnusedDataFor: 600 },
    listRuleSets: { providesTags: list("RuleSet") },
    createRuleSet: { invalidatesTags: onSuccess({ type: "RuleSet", id: LIST }) },
    getRuleSet: { providesTags: item("RuleSet") },
    saveRuleDraft: { invalidatesTags: onSuccess({ type: "RuleSet", id: LIST }), ...putRuleSet },
    publishRuleSet: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "RuleSet", id: a.id }, { type: "RuleSet", id: LIST }, { type: "RuleVersion", id: a.id }]) },
    archiveRuleSet: { invalidatesTags: onSuccess({ type: "RuleSet", id: LIST }), ...putRuleSet },
    unarchiveRuleSet: { invalidatesTags: onSuccess({ type: "RuleSet", id: LIST }), ...putRuleSet },
    listRuleVersions: { providesTags: item("RuleVersion") },
    getRuleVersion: { providesTags: (_r, _e, a) => [{ type: "RuleVersion", id: `${a.id}@${a.version}` }] },
    restoreRuleVersion: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "RuleSet", id: LIST }, { type: "RuleVersion", id: a.id }]), ...putRuleSet },

    // ------------------------------------------------------------ Admin: automations
    getAutomationCatalog: { providesTags: tags("Automation"), keepUnusedDataFor: 600 },
    getAutomationStats: { providesTags: tags("Automation") },
    listWorkflows: { providesTags: list("Workflow") },
    createWorkflow: { invalidatesTags: onSuccess({ type: "Workflow", id: LIST }) },
    getWorkflow: { providesTags: item("Workflow") },
    deleteWorkflow: { invalidatesTags: itemAndList("Workflow") },
    saveWorkflowDraft: { invalidatesTags: onSuccess({ type: "Workflow", id: LIST }), ...putWorkflow },
    publishWorkflow: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "Workflow", id: a.id }, { type: "Workflow", id: LIST }, { type: "WorkflowVersion", id: a.id }]) },
    pauseWorkflow: { invalidatesTags: onSuccess({ type: "Workflow", id: LIST }), ...putWorkflow },
    activateWorkflow: { invalidatesTags: onSuccess({ type: "Workflow", id: LIST }), ...putWorkflow },
    discardWorkflowDraft: { invalidatesTags: onSuccess({ type: "Workflow", id: LIST }), ...putWorkflow },
    listWorkflowVersions: { providesTags: item("WorkflowVersion") },
    restoreWorkflowVersion: { invalidatesTags: (_r, e, a) => (e ? [] : [{ type: "Workflow", id: LIST }, { type: "WorkflowVersion", id: a.id }]), ...putWorkflow },
    listWorkflowRuns: { providesTags: (r) => list("Run")(r) },
    startWorkflowRun: { invalidatesTags: onSuccess({ type: "Run", id: LIST }, "Automation") },
    listRuns: { providesTags: list("Run") },
    getRun: { providesTags: (_r, _e, a) => [{ type: "Run", id: a.runId }] },

    // ------------------------------------------------------------ Admin: console
    getAdminOverview: { providesTags: tags("AdminOverview") },
    getAdminFinance: { providesTags: tags("AdminFinance") },
    listFeePolicies: { providesTags: tags("FeePolicy") },
    createFeePolicy: { invalidatesTags: onSuccess("FeePolicy", "Audit") },
    listReconciliations: { providesTags: tags("Reconciliation") },
    runReconciliation: { invalidatesTags: onSuccess("Reconciliation") },
    listCreatorFundRuns: { providesTags: tags("CreatorFund") },
    postCreatorFund: { invalidatesTags: onSuccess("CreatorFund", "AdminFinance", "AdminOverview", "Audit") },
    getAdminEngagement: { providesTags: tags("AdminEngagement") },
    listAdminUsers: { providesTags: list("AdminUser") },
    getAdminUser: { providesTags: item("AdminUser") },
    setAdminUserRoles: { invalidatesTags: onSuccess({ type: "AdminUser", id: LIST }), ...putAdminUser },
    suspendUser: { invalidatesTags: onSuccess({ type: "AdminUser", id: LIST }, "Audit"), ...putAdminUser },
    unsuspendUser: { invalidatesTags: onSuccess({ type: "AdminUser", id: LIST }, "Audit"), ...putAdminUser },
    tagUser: { invalidatesTags: onSuccess({ type: "AdminUser", id: LIST }, "AdminTag"), ...putAdminUser },
    untagUser: { invalidatesTags: onSuccess({ type: "AdminUser", id: LIST }, "AdminTag"), ...putAdminUser },
    listTags: { providesTags: tags("AdminTag") },
    listAudit: {
      providesTags: tags("Audit"),
      // "Load older": one cache entry per filter; pages with a `before` cursor append.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.action ?? ""}|${queryArgs.targetType ?? ""}|${queryArgs.limit ?? ""})`,
      merge: (cache, page, { arg }) => {
        if (!arg.before) return page;
        const seen = new Set(cache.data.map((e) => e.id));
        cache.data.push(...page.data.filter((e) => !seen.has(e.id)));
        cache.nextBefore = page.nextBefore;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.before !== previousArg?.before,
    },
  },
});
