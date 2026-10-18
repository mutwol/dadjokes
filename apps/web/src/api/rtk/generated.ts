import { baseApi as api } from "./baseApi";
const injectedRtkApi = api.injectEndpoints({
  endpoints: (build) => ({
    createUpload: build.mutation<CreateUploadApiResponse, CreateUploadApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/uploads`,
        method: "POST",
        body: queryArg.createUploadRequest,
      }),
    }),
    listActivity: build.query<ListActivityApiResponse, ListActivityApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/activity`,
        params: {
          limit: queryArg.limit,
          cursor: queryArg.cursor,
        },
      }),
    }),
    markActivityRead: build.mutation<
      MarkActivityReadApiResponse,
      MarkActivityReadApiArg
    >({
      query: () => ({ url: `/v1/me/activity/read`, method: "POST" }),
    }),
    getPushConfig: build.query<GetPushConfigApiResponse, GetPushConfigApiArg>({
      query: () => ({ url: `/v1/push/config` }),
    }),
    addPushSubscription: build.mutation<
      AddPushSubscriptionApiResponse,
      AddPushSubscriptionApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/push-subscriptions`,
        method: "PUT",
        body: queryArg.pushSubscriptionRequest,
      }),
    }),
    removePushSubscription: build.mutation<
      RemovePushSubscriptionApiResponse,
      RemovePushSubscriptionApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/push-subscriptions`,
        method: "DELETE",
        body: queryArg.removePushSubscriptionRequest,
      }),
    }),
    getMe: build.query<GetMeApiResponse, GetMeApiArg>({
      query: () => ({ url: `/v1/me` }),
    }),
    updateMe: build.mutation<UpdateMeApiResponse, UpdateMeApiArg>({
      query: (queryArg) => ({
        url: `/v1/me`,
        method: "PATCH",
        body: queryArg.updateMeRequest,
      }),
    }),
    completeOnboarding: build.mutation<
      CompleteOnboardingApiResponse,
      CompleteOnboardingApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/onboarding`,
        method: "POST",
        body: queryArg.completeOnboardingRequest,
      }),
    }),
    replaceMyRoles: build.mutation<
      ReplaceMyRolesApiResponse,
      ReplaceMyRolesApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/roles`,
        method: "PUT",
        body: queryArg.replaceRolesRequest,
      }),
    }),
    updateMyPreferences: build.mutation<
      UpdateMyPreferencesApiResponse,
      UpdateMyPreferencesApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/preferences`,
        method: "PATCH",
        body: queryArg.updatePreferencesRequest,
      }),
    }),
    setMyPayoutMethod: build.mutation<
      SetMyPayoutMethodApiResponse,
      SetMyPayoutMethodApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/payout-method`,
        method: "PUT",
        body: queryArg.payoutMethodRequest,
      }),
    }),
    removeMyPayoutMethod: build.mutation<
      RemoveMyPayoutMethodApiResponse,
      RemoveMyPayoutMethodApiArg
    >({
      query: () => ({ url: `/v1/me/payout-method`, method: "DELETE" }),
    }),
    checkHandle: build.query<CheckHandleApiResponse, CheckHandleApiArg>({
      query: (queryArg) => ({
        url: `/v1/handles/${queryArg.handle}/availability`,
      }),
    }),
    listTopics: build.query<ListTopicsApiResponse, ListTopicsApiArg>({
      query: () => ({ url: `/v1/topics` }),
    }),
    listCreators: build.query<ListCreatorsApiResponse, ListCreatorsApiArg>({
      query: (queryArg) => ({
        url: `/v1/creators`,
        params: {
          sort: queryArg.sort,
          country: queryArg.country,
          limit: queryArg.limit,
          cursor: queryArg.cursor,
        },
      }),
    }),
    getCreator: build.query<GetCreatorApiResponse, GetCreatorApiArg>({
      query: (queryArg) => ({ url: `/v1/creators/${queryArg.handle}` }),
    }),
    listMySubscriptions: build.query<
      ListMySubscriptionsApiResponse,
      ListMySubscriptionsApiArg
    >({
      query: () => ({ url: `/v1/me/subscriptions` }),
    }),
    subscribe: build.mutation<SubscribeApiResponse, SubscribeApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/subscriptions/${queryArg.creatorId}`,
        method: "PUT",
      }),
    }),
    unsubscribe: build.mutation<UnsubscribeApiResponse, UnsubscribeApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/subscriptions/${queryArg.creatorId}`,
        method: "DELETE",
      }),
    }),
    submitJoke: build.mutation<SubmitJokeApiResponse, SubmitJokeApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/jokes`,
        method: "POST",
        body: queryArg.createJokeRequest,
      }),
    }),
    listMyJokes: build.query<ListMyJokesApiResponse, ListMyJokesApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/jokes`,
        params: {
          status: queryArg.status,
          limit: queryArg.limit,
          cursor: queryArg.cursor,
        },
      }),
    }),
    getMyJoke: build.query<GetMyJokeApiResponse, GetMyJokeApiArg>({
      query: (queryArg) => ({ url: `/v1/me/jokes/${queryArg.id}` }),
    }),
    withdrawMyJoke: build.mutation<
      WithdrawMyJokeApiResponse,
      WithdrawMyJokeApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/jokes/${queryArg.id}/withdraw`,
        method: "POST",
      }),
    }),
    getReviewQueue: build.query<
      GetReviewQueueApiResponse,
      GetReviewQueueApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/curation/queue`,
        params: {
          limit: queryArg.limit,
          cursor: queryArg.cursor,
        },
      }),
    }),
    getCurationCalendar: build.query<
      GetCurationCalendarApiResponse,
      GetCurationCalendarApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/curation/calendar`,
        params: {
          from: queryArg["from"],
          days: queryArg.days,
        },
      }),
    }),
    getCuratedJoke: build.query<
      GetCuratedJokeApiResponse,
      GetCuratedJokeApiArg
    >({
      query: (queryArg) => ({ url: `/v1/curation/jokes/${queryArg.id}` }),
    }),
    scheduleJoke: build.mutation<ScheduleJokeApiResponse, ScheduleJokeApiArg>({
      query: (queryArg) => ({
        url: `/v1/curation/jokes/${queryArg.id}/schedule`,
        method: "POST",
        body: queryArg.scheduleJokeRequest,
      }),
    }),
    declineJoke: build.mutation<DeclineJokeApiResponse, DeclineJokeApiArg>({
      query: (queryArg) => ({
        url: `/v1/curation/jokes/${queryArg.id}/decline`,
        method: "POST",
        body: queryArg.declineJokeRequest,
      }),
    }),
    getToday: build.query<GetTodayApiResponse, GetTodayApiArg>({
      query: () => ({ url: `/v1/me/today` }),
    }),
    openDelivery: build.mutation<OpenDeliveryApiResponse, OpenDeliveryApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/deliveries/${queryArg.date}/open`,
        method: "POST",
      }),
    }),
    getStudioSummary: build.query<
      GetStudioSummaryApiResponse,
      GetStudioSummaryApiArg
    >({
      query: () => ({ url: `/v1/me/studio` }),
    }),
    getJoke: build.query<GetJokeApiResponse, GetJokeApiArg>({
      query: (queryArg) => ({ url: `/v1/jokes/${queryArg.id}` }),
    }),
    react: build.mutation<ReactApiResponse, ReactApiArg>({
      query: (queryArg) => ({
        url: `/v1/jokes/${queryArg.id}/reaction`,
        method: "PUT",
        body: queryArg.reactRequest,
      }),
    }),
    unreact: build.mutation<UnreactApiResponse, UnreactApiArg>({
      query: (queryArg) => ({
        url: `/v1/jokes/${queryArg.id}/reaction`,
        method: "DELETE",
      }),
    }),
    listComments: build.query<ListCommentsApiResponse, ListCommentsApiArg>({
      query: (queryArg) => ({
        url: `/v1/jokes/${queryArg.id}/comments`,
        params: {
          limit: queryArg.limit,
          cursor: queryArg.cursor,
        },
      }),
    }),
    addComment: build.mutation<AddCommentApiResponse, AddCommentApiArg>({
      query: (queryArg) => ({
        url: `/v1/jokes/${queryArg.id}/comments`,
        method: "POST",
        body: queryArg.createCommentRequest,
      }),
    }),
    liveStats: build.query<LiveStatsApiResponse, LiveStatsApiArg>({
      query: (queryArg) => ({ url: `/v1/jokes/${queryArg.id}/live` }),
    }),
    deleteComment: build.mutation<
      DeleteCommentApiResponse,
      DeleteCommentApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/comments/${queryArg.id}`,
        method: "DELETE",
      }),
    }),
    report: build.mutation<ReportApiResponse, ReportApiArg>({
      query: (queryArg) => ({
        url: `/v1/reports`,
        method: "POST",
        body: queryArg.createReportRequest,
      }),
    }),
    recordEvents: build.mutation<RecordEventsApiResponse, RecordEventsApiArg>({
      query: (queryArg) => ({
        url: `/v1/events`,
        method: "POST",
        body: queryArg.eventsRequest,
      }),
    }),
    getStudioDaily: build.query<
      GetStudioDailyApiResponse,
      GetStudioDailyApiArg
    >({
      query: () => ({ url: `/v1/me/studio/daily` }),
    }),
    listReports: build.query<ListReportsApiResponse, ListReportsApiArg>({
      query: (queryArg) => ({
        url: `/v1/curation/reports`,
        params: {
          status: queryArg.status,
        },
      }),
    }),
    hideComment: build.mutation<HideCommentApiResponse, HideCommentApiArg>({
      query: (queryArg) => ({
        url: `/v1/curation/comments/${queryArg.id}/hide`,
        method: "POST",
      }),
    }),
    unhideComment: build.mutation<
      UnhideCommentApiResponse,
      UnhideCommentApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/curation/comments/${queryArg.id}/unhide`,
        method: "POST",
      }),
    }),
    resolveReports: build.mutation<
      ResolveReportsApiResponse,
      ResolveReportsApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/curation/reports/resolve`,
        method: "POST",
        body: queryArg.resolveReportsRequest,
      }),
    }),
    listDecisionPoints: build.query<
      ListDecisionPointsApiResponse,
      ListDecisionPointsApiArg
    >({
      query: () => ({ url: `/v1/admin/decision-points` }),
    }),
    listRuleSets: build.query<ListRuleSetsApiResponse, ListRuleSetsApiArg>({
      query: () => ({ url: `/v1/admin/rules` }),
    }),
    createRuleSet: build.mutation<
      CreateRuleSetApiResponse,
      CreateRuleSetApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules`,
        method: "POST",
        body: queryArg.createRuleSetRequest,
      }),
    }),
    getRuleSet: build.query<GetRuleSetApiResponse, GetRuleSetApiArg>({
      query: (queryArg) => ({ url: `/v1/admin/rules/${queryArg.id}` }),
    }),
    saveRuleDraft: build.mutation<
      SaveRuleDraftApiResponse,
      SaveRuleDraftApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/draft`,
        method: "PUT",
        body: queryArg.updateRuleDraftRequest,
      }),
    }),
    evaluateRuleSet: build.mutation<
      EvaluateRuleSetApiResponse,
      EvaluateRuleSetApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/evaluate`,
        method: "POST",
        body: queryArg.evaluateRuleSetRequest,
      }),
    }),
    testRuleSet: build.mutation<TestRuleSetApiResponse, TestRuleSetApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/test`,
        method: "POST",
        body: queryArg.runRuleTestsRequest,
      }),
    }),
    publishRuleSet: build.mutation<
      PublishRuleSetApiResponse,
      PublishRuleSetApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/publish`,
        method: "POST",
      }),
    }),
    archiveRuleSet: build.mutation<
      ArchiveRuleSetApiResponse,
      ArchiveRuleSetApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/archive`,
        method: "POST",
      }),
    }),
    unarchiveRuleSet: build.mutation<
      UnarchiveRuleSetApiResponse,
      UnarchiveRuleSetApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/unarchive`,
        method: "POST",
      }),
    }),
    listRuleVersions: build.query<
      ListRuleVersionsApiResponse,
      ListRuleVersionsApiArg
    >({
      query: (queryArg) => ({ url: `/v1/admin/rules/${queryArg.id}/versions` }),
    }),
    getRuleVersion: build.query<
      GetRuleVersionApiResponse,
      GetRuleVersionApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/versions/${queryArg.version}`,
      }),
    }),
    restoreRuleVersion: build.mutation<
      RestoreRuleVersionApiResponse,
      RestoreRuleVersionApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/rules/${queryArg.id}/versions/${queryArg.version}/restore`,
        method: "POST",
      }),
    }),
    tipJoke: build.mutation<TipJokeApiResponse, TipJokeApiArg>({
      query: (queryArg) => ({
        url: `/v1/jokes/${queryArg.id}/tips`,
        method: "POST",
        body: queryArg.createTipRequest,
      }),
    }),
    listJokeTips: build.query<ListJokeTipsApiResponse, ListJokeTipsApiArg>({
      query: (queryArg) => ({ url: `/v1/jokes/${queryArg.id}/tips` }),
    }),
    setTipNoteHidden: build.mutation<
      SetTipNoteHiddenApiResponse,
      SetTipNoteHiddenApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/tips/${queryArg.id}/note-hidden`,
        method: "PUT",
        body: queryArg.hideTipNoteRequest,
      }),
    }),
    simulateTipPrompt: build.mutation<
      SimulateTipPromptApiResponse,
      SimulateTipPromptApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/tips/${queryArg.id}/simulate`,
        method: "POST",
        body: queryArg.simulateTipPromptRequest,
      }),
    }),
    getTip: build.query<GetTipApiResponse, GetTipApiArg>({
      query: (queryArg) => ({ url: `/v1/tips/${queryArg.id}` }),
    }),
    getBalance: build.query<GetBalanceApiResponse, GetBalanceApiArg>({
      query: () => ({ url: `/v1/me/balance` }),
    }),
    listPayouts: build.query<ListPayoutsApiResponse, ListPayoutsApiArg>({
      query: () => ({ url: `/v1/me/payouts` }),
    }),
    requestPayout: build.mutation<
      RequestPayoutApiResponse,
      RequestPayoutApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/me/payouts`,
        method: "POST",
        body: queryArg.createPayoutRequest,
      }),
    }),
    listFeePolicies: build.query<
      ListFeePoliciesApiResponse,
      ListFeePoliciesApiArg
    >({
      query: () => ({ url: `/v1/admin/finance/fee-policies` }),
    }),
    createFeePolicy: build.mutation<
      CreateFeePolicyApiResponse,
      CreateFeePolicyApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/finance/fee-policies`,
        method: "POST",
        body: queryArg.createFeePolicyRequest,
      }),
    }),
    listReconciliations: build.query<
      ListReconciliationsApiResponse,
      ListReconciliationsApiArg
    >({
      query: () => ({ url: `/v1/admin/finance/reconciliations` }),
    }),
    runReconciliation: build.mutation<
      RunReconciliationApiResponse,
      RunReconciliationApiArg
    >({
      query: () => ({
        url: `/v1/admin/finance/reconciliations`,
        method: "POST",
      }),
    }),
    listCreatorFundRuns: build.query<
      ListCreatorFundRunsApiResponse,
      ListCreatorFundRunsApiArg
    >({
      query: () => ({ url: `/v1/admin/finance/creator-fund` }),
    }),
    postCreatorFund: build.mutation<
      PostCreatorFundApiResponse,
      PostCreatorFundApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/finance/creator-fund`,
        method: "POST",
        body: queryArg.creatorFundRequest,
      }),
    }),
    previewCreatorFund: build.mutation<
      PreviewCreatorFundApiResponse,
      PreviewCreatorFundApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/finance/creator-fund/preview`,
        method: "POST",
        body: queryArg.creatorFundRequest,
      }),
    }),
    appealJoke: build.mutation<AppealJokeApiResponse, AppealJokeApiArg>({
      query: (queryArg) => ({
        url: `/v1/me/jokes/${queryArg.id}/appeal`,
        method: "POST",
        body: queryArg.createAppealRequest,
      }),
    }),
    listMyAppeals: build.query<ListMyAppealsApiResponse, ListMyAppealsApiArg>({
      query: () => ({ url: `/v1/me/appeals` }),
    }),
    listAppeals: build.query<ListAppealsApiResponse, ListAppealsApiArg>({
      query: (queryArg) => ({
        url: `/v1/curation/appeals`,
        params: {
          status: queryArg.status,
        },
      }),
    }),
    resolveAppeal: build.mutation<
      ResolveAppealApiResponse,
      ResolveAppealApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/curation/appeals/${queryArg.id}/resolve`,
        method: "POST",
        body: queryArg.resolveAppealRequest,
      }),
    }),
    getAutomationCatalog: build.query<
      GetAutomationCatalogApiResponse,
      GetAutomationCatalogApiArg
    >({
      query: () => ({ url: `/v1/admin/automation/catalog` }),
    }),
    getAutomationStats: build.query<
      GetAutomationStatsApiResponse,
      GetAutomationStatsApiArg
    >({
      query: () => ({ url: `/v1/admin/automation/stats` }),
    }),
    listWorkflows: build.query<ListWorkflowsApiResponse, ListWorkflowsApiArg>({
      query: () => ({ url: `/v1/admin/workflows` }),
    }),
    createWorkflow: build.mutation<
      CreateWorkflowApiResponse,
      CreateWorkflowApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows`,
        method: "POST",
        body: queryArg.createWorkflowRequest,
      }),
    }),
    getWorkflow: build.query<GetWorkflowApiResponse, GetWorkflowApiArg>({
      query: (queryArg) => ({ url: `/v1/admin/workflows/${queryArg.id}` }),
    }),
    deleteWorkflow: build.mutation<
      DeleteWorkflowApiResponse,
      DeleteWorkflowApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}`,
        method: "DELETE",
      }),
    }),
    saveWorkflowDraft: build.mutation<
      SaveWorkflowDraftApiResponse,
      SaveWorkflowDraftApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/draft`,
        method: "PUT",
        body: queryArg.updateWorkflowDraftRequest,
      }),
    }),
    publishWorkflow: build.mutation<
      PublishWorkflowApiResponse,
      PublishWorkflowApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/publish`,
        method: "POST",
      }),
    }),
    pauseWorkflow: build.mutation<
      PauseWorkflowApiResponse,
      PauseWorkflowApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/pause`,
        method: "POST",
      }),
    }),
    activateWorkflow: build.mutation<
      ActivateWorkflowApiResponse,
      ActivateWorkflowApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/activate`,
        method: "POST",
      }),
    }),
    discardWorkflowDraft: build.mutation<
      DiscardWorkflowDraftApiResponse,
      DiscardWorkflowDraftApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/discard-draft`,
        method: "POST",
      }),
    }),
    listWorkflowVersions: build.query<
      ListWorkflowVersionsApiResponse,
      ListWorkflowVersionsApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/versions`,
      }),
    }),
    restoreWorkflowVersion: build.mutation<
      RestoreWorkflowVersionApiResponse,
      RestoreWorkflowVersionApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/versions/${queryArg.version}/restore`,
        method: "POST",
      }),
    }),
    listWorkflowRuns: build.query<
      ListWorkflowRunsApiResponse,
      ListWorkflowRunsApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/runs`,
        params: {
          status: queryArg.status,
          limit: queryArg.limit,
        },
      }),
    }),
    startWorkflowRun: build.mutation<
      StartWorkflowRunApiResponse,
      StartWorkflowRunApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/workflows/${queryArg.id}/runs`,
        method: "POST",
        body: queryArg.startWorkflowRunRequest,
      }),
    }),
    listRuns: build.query<ListRunsApiResponse, ListRunsApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/runs`,
        params: {
          status: queryArg.status,
          limit: queryArg.limit,
        },
      }),
    }),
    getRun: build.query<GetRunApiResponse, GetRunApiArg>({
      query: (queryArg) => ({ url: `/v1/admin/runs/${queryArg.runId}` }),
    }),
    getAdminOverview: build.query<
      GetAdminOverviewApiResponse,
      GetAdminOverviewApiArg
    >({
      query: () => ({ url: `/v1/admin/overview` }),
    }),
    getAdminFinance: build.query<
      GetAdminFinanceApiResponse,
      GetAdminFinanceApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/finance`,
        params: {
          days: queryArg.days,
        },
      }),
    }),
    exportLedger: build.query<ExportLedgerApiResponse, ExportLedgerApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/finance/ledger.csv`,
        params: {
          days: queryArg.days,
        },
      }),
    }),
    getAdminEngagement: build.query<
      GetAdminEngagementApiResponse,
      GetAdminEngagementApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/engagement`,
        params: {
          days: queryArg.days,
        },
      }),
    }),
    listAdminUsers: build.query<
      ListAdminUsersApiResponse,
      ListAdminUsersApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/users`,
        params: {
          q: queryArg.q,
          role: queryArg.role,
          tag: queryArg.tag,
          status: queryArg.status,
          page: queryArg.page,
          size: queryArg.size,
          sort: queryArg.sort,
        },
      }),
    }),
    getAdminUser: build.query<GetAdminUserApiResponse, GetAdminUserApiArg>({
      query: (queryArg) => ({ url: `/v1/admin/users/${queryArg.id}` }),
    }),
    setAdminUserRoles: build.mutation<
      SetAdminUserRolesApiResponse,
      SetAdminUserRolesApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/users/${queryArg.id}/roles`,
        method: "PUT",
        body: queryArg.setRolesRequest,
      }),
    }),
    suspendUser: build.mutation<SuspendUserApiResponse, SuspendUserApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/users/${queryArg.id}/suspend`,
        method: "POST",
        body: queryArg.suspendRequest,
      }),
    }),
    unsuspendUser: build.mutation<
      UnsuspendUserApiResponse,
      UnsuspendUserApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/admin/users/${queryArg.id}/unsuspend`,
        method: "POST",
      }),
    }),
    tagUser: build.mutation<TagUserApiResponse, TagUserApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/users/${queryArg.id}/tags/${queryArg.tag}`,
        method: "PUT",
      }),
    }),
    untagUser: build.mutation<UntagUserApiResponse, UntagUserApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/users/${queryArg.id}/tags/${queryArg.tag}`,
        method: "DELETE",
      }),
    }),
    listTags: build.query<ListTagsApiResponse, ListTagsApiArg>({
      query: () => ({ url: `/v1/admin/tags` }),
    }),
    listAudit: build.query<ListAuditApiResponse, ListAuditApiArg>({
      query: (queryArg) => ({
        url: `/v1/admin/audit`,
        params: {
          action: queryArg.action,
          targetType: queryArg.targetType,
          before: queryArg.before,
          limit: queryArg.limit,
        },
      }),
    }),
    getLanding: build.query<GetLandingApiResponse, GetLandingApiArg>({
      query: () => ({ url: `/v1/public/landing` }),
    }),
    startEmailSignIn: build.mutation<
      StartEmailSignInApiResponse,
      StartEmailSignInApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/auth/email/start`,
        method: "POST",
        body: queryArg.startEmailRequest,
      }),
    }),
    verifyEmailSignIn: build.mutation<
      VerifyEmailSignInApiResponse,
      VerifyEmailSignInApiArg
    >({
      query: (queryArg) => ({
        url: `/v1/auth/email/verify`,
        method: "POST",
        body: queryArg.verifyEmailRequest,
      }),
    }),
    googleSignIn: build.mutation<GoogleSignInApiResponse, GoogleSignInApiArg>({
      query: (queryArg) => ({
        url: `/v1/auth/google`,
        method: "POST",
        body: queryArg.googleSignInRequest,
      }),
    }),
  }),
  overrideExisting: false,
});
export { injectedRtkApi as generatedApi };
export type CreateUploadApiResponse = /** status 201 OK */ Upload;
export type CreateUploadApiArg = {
  createUploadRequest: CreateUploadRequest;
};
export type ListActivityApiResponse = /** status 200 OK */ ActivityPage;
export type ListActivityApiArg = {
  limit?: number;
  cursor?: string;
};
export type MarkActivityReadApiResponse = unknown;
export type MarkActivityReadApiArg = void;
export type GetPushConfigApiResponse = /** status 200 OK */ PushConfig;
export type GetPushConfigApiArg = void;
export type AddPushSubscriptionApiResponse = unknown;
export type AddPushSubscriptionApiArg = {
  pushSubscriptionRequest: PushSubscriptionRequest;
};
export type RemovePushSubscriptionApiResponse = unknown;
export type RemovePushSubscriptionApiArg = {
  removePushSubscriptionRequest: RemovePushSubscriptionRequest;
};
export type GetMeApiResponse = /** status 200 OK */ Me;
export type GetMeApiArg = void;
export type UpdateMeApiResponse = /** status 200 OK */ Me;
export type UpdateMeApiArg = {
  updateMeRequest: UpdateMeRequest;
};
export type CompleteOnboardingApiResponse = /** status 200 OK */ Me;
export type CompleteOnboardingApiArg = {
  completeOnboardingRequest: CompleteOnboardingRequest;
};
export type ReplaceMyRolesApiResponse = /** status 200 OK */ Me;
export type ReplaceMyRolesApiArg = {
  replaceRolesRequest: ReplaceRolesRequest;
};
export type UpdateMyPreferencesApiResponse = /** status 200 OK */ Me;
export type UpdateMyPreferencesApiArg = {
  updatePreferencesRequest: UpdatePreferencesRequest;
};
export type SetMyPayoutMethodApiResponse = /** status 200 OK */ Me;
export type SetMyPayoutMethodApiArg = {
  payoutMethodRequest: PayoutMethodRequest;
};
export type RemoveMyPayoutMethodApiResponse = unknown;
export type RemoveMyPayoutMethodApiArg = void;
export type CheckHandleApiResponse = /** status 200 OK */ HandleAvailability;
export type CheckHandleApiArg = {
  handle: string;
};
export type ListTopicsApiResponse = /** status 200 OK */ TopicList;
export type ListTopicsApiArg = void;
export type ListCreatorsApiResponse = /** status 200 OK */ CreatorPage;
export type ListCreatorsApiArg = {
  sort?: "popular" | "new";
  country?: string;
  limit?: number;
  cursor?: string;
};
export type GetCreatorApiResponse = /** status 200 OK */ Creator;
export type GetCreatorApiArg = {
  handle: string;
};
export type ListMySubscriptionsApiResponse = /** status 200 OK */ CreatorList;
export type ListMySubscriptionsApiArg = void;
export type SubscribeApiResponse = unknown;
export type SubscribeApiArg = {
  creatorId: string;
};
export type UnsubscribeApiResponse = unknown;
export type UnsubscribeApiArg = {
  creatorId: string;
};
export type SubmitJokeApiResponse =
  /** status 201 Submitted for review */ Submission;
export type SubmitJokeApiArg = {
  createJokeRequest: CreateJokeRequest;
};
export type ListMyJokesApiResponse = /** status 200 OK */ SubmissionPage;
export type ListMyJokesApiArg = {
  status?: "in_review" | "scheduled" | "delivered" | "declined" | "withdrawn";
  limit?: number;
  cursor?: string;
};
export type GetMyJokeApiResponse = /** status 200 OK */ Submission;
export type GetMyJokeApiArg = {
  id: string;
};
export type WithdrawMyJokeApiResponse = /** status 200 OK */ Submission;
export type WithdrawMyJokeApiArg = {
  id: string;
};
export type GetReviewQueueApiResponse = /** status 200 OK */ QueuePage;
export type GetReviewQueueApiArg = {
  limit?: number;
  cursor?: string;
};
export type GetCurationCalendarApiResponse =
  /** status 200 OK */ CurationCalendar;
export type GetCurationCalendarApiArg = {
  from?: string;
  days?: number;
};
export type GetCuratedJokeApiResponse = /** status 200 OK */ CuratedJoke;
export type GetCuratedJokeApiArg = {
  id: string;
};
export type ScheduleJokeApiResponse = /** status 200 OK */ CuratedJoke;
export type ScheduleJokeApiArg = {
  id: string;
  scheduleJokeRequest: ScheduleJokeRequest;
};
export type DeclineJokeApiResponse = /** status 200 OK */ CuratedJoke;
export type DeclineJokeApiArg = {
  id: string;
  declineJokeRequest: DeclineJokeRequest;
};
export type GetTodayApiResponse = /** status 200 OK */ Today;
export type GetTodayApiArg = void;
export type OpenDeliveryApiResponse = /** status 200 OK */ Joke;
export type OpenDeliveryApiArg = {
  /** My local date, YYYY-MM-DD */
  date: string;
};
export type GetStudioSummaryApiResponse = /** status 200 OK */ StudioSummary;
export type GetStudioSummaryApiArg = void;
export type GetJokeApiResponse = /** status 200 OK */ Joke;
export type GetJokeApiArg = {
  id: string;
};
export type ReactApiResponse = /** status 200 OK */ JokeStats;
export type ReactApiArg = {
  id: string;
  reactRequest: ReactRequest;
};
export type UnreactApiResponse = /** status 200 OK */ JokeStats;
export type UnreactApiArg = {
  id: string;
};
export type ListCommentsApiResponse = /** status 200 OK */ CommentPage;
export type ListCommentsApiArg = {
  id: string;
  limit?: number;
  cursor?: string;
};
export type AddCommentApiResponse = /** status 201 OK */ Comment;
export type AddCommentApiArg = {
  id: string;
  createCommentRequest: CreateCommentRequest;
};
export type LiveStatsApiResponse = unknown;
export type LiveStatsApiArg = {
  id: string;
};
export type DeleteCommentApiResponse = unknown;
export type DeleteCommentApiArg = {
  id: string;
};
export type ReportApiResponse = /** status 200 OK */ ReportReceipt;
export type ReportApiArg = {
  createReportRequest: CreateReportRequest;
};
export type RecordEventsApiResponse = /** status 202 OK */ EventsAccepted;
export type RecordEventsApiArg = {
  eventsRequest: EventsRequest;
};
export type GetStudioDailyApiResponse = /** status 200 OK */ StudioDaily;
export type GetStudioDailyApiArg = void;
export type ListReportsApiResponse = /** status 200 OK */ ReportedItemList;
export type ListReportsApiArg = {
  status?: "open" | "resolved";
};
export type HideCommentApiResponse = unknown;
export type HideCommentApiArg = {
  id: string;
};
export type UnhideCommentApiResponse = unknown;
export type UnhideCommentApiArg = {
  id: string;
};
export type ResolveReportsApiResponse = unknown;
export type ResolveReportsApiArg = {
  resolveReportsRequest: ResolveReportsRequest;
};
export type ListDecisionPointsApiResponse =
  /** status 200 OK */ DecisionPointList;
export type ListDecisionPointsApiArg = void;
export type ListRuleSetsApiResponse = /** status 200 OK */ RuleSetList;
export type ListRuleSetsApiArg = void;
export type CreateRuleSetApiResponse = /** status 201 OK */ RuleSetDetail;
export type CreateRuleSetApiArg = {
  createRuleSetRequest: CreateRuleSetRequest;
};
export type GetRuleSetApiResponse = /** status 200 OK */ RuleSetDetail;
export type GetRuleSetApiArg = {
  id: string;
};
export type SaveRuleDraftApiResponse = /** status 200 OK */ RuleSetDetail;
export type SaveRuleDraftApiArg = {
  id: string;
  updateRuleDraftRequest: UpdateRuleDraftRequest;
};
export type EvaluateRuleSetApiResponse = /** status 200 OK */ RuleEvaluation;
export type EvaluateRuleSetApiArg = {
  id: string;
  evaluateRuleSetRequest: EvaluateRuleSetRequest;
};
export type TestRuleSetApiResponse = /** status 200 OK */ RuleTestReport;
export type TestRuleSetApiArg = {
  id: string;
  runRuleTestsRequest: RunRuleTestsRequest;
};
export type PublishRuleSetApiResponse = /** status 200 OK */ RulePublishResult;
export type PublishRuleSetApiArg = {
  id: string;
};
export type ArchiveRuleSetApiResponse = /** status 200 OK */ RuleSetDetail;
export type ArchiveRuleSetApiArg = {
  id: string;
};
export type UnarchiveRuleSetApiResponse = /** status 200 OK */ RuleSetDetail;
export type UnarchiveRuleSetApiArg = {
  id: string;
};
export type ListRuleVersionsApiResponse = /** status 200 OK */ RuleVersionList;
export type ListRuleVersionsApiArg = {
  id: string;
};
export type GetRuleVersionApiResponse = /** status 200 OK */ RuleVersion;
export type GetRuleVersionApiArg = {
  id: string;
  version: number;
};
export type RestoreRuleVersionApiResponse = /** status 200 OK */ RuleSetDetail;
export type RestoreRuleVersionApiArg = {
  id: string;
  version: number;
};
export type TipJokeApiResponse = /** status 201 OK */ Tip;
export type TipJokeApiArg = {
  id: string;
  createTipRequest: CreateTipRequest;
};
export type ListJokeTipsApiResponse = /** status 200 OK */ TipWall;
export type ListJokeTipsApiArg = {
  id: string;
};
export type SetTipNoteHiddenApiResponse = unknown;
export type SetTipNoteHiddenApiArg = {
  id: string;
  hideTipNoteRequest: HideTipNoteRequest;
};
export type SimulateTipPromptApiResponse = /** status 200 OK */ Tip;
export type SimulateTipPromptApiArg = {
  id: string;
  simulateTipPromptRequest: SimulateTipPromptRequest;
};
export type GetTipApiResponse = /** status 200 OK */ Tip;
export type GetTipApiArg = {
  id: string;
};
export type GetBalanceApiResponse = /** status 200 OK */ Balance;
export type GetBalanceApiArg = void;
export type ListPayoutsApiResponse = /** status 200 OK */ PayoutList;
export type ListPayoutsApiArg = void;
export type RequestPayoutApiResponse = /** status 201 OK */ PayoutTransfer;
export type RequestPayoutApiArg = {
  createPayoutRequest: CreatePayoutRequest;
};
export type ListFeePoliciesApiResponse = /** status 200 OK */ FeePolicyList;
export type ListFeePoliciesApiArg = void;
export type CreateFeePolicyApiResponse = /** status 201 OK */ FeePolicy;
export type CreateFeePolicyApiArg = {
  createFeePolicyRequest: CreateFeePolicyRequest;
};
export type ListReconciliationsApiResponse =
  /** status 200 OK */ ReconciliationRunList;
export type ListReconciliationsApiArg = void;
export type RunReconciliationApiResponse =
  /** status 201 OK */ ReconciliationRun;
export type RunReconciliationApiArg = void;
export type ListCreatorFundRunsApiResponse =
  /** status 200 OK */ CreatorFundRunList;
export type ListCreatorFundRunsApiArg = void;
export type PostCreatorFundApiResponse = /** status 201 OK */ CreatorFundRun;
export type PostCreatorFundApiArg = {
  creatorFundRequest: CreatorFundRequest;
};
export type PreviewCreatorFundApiResponse =
  /** status 200 OK */ CreatorFundPreview;
export type PreviewCreatorFundApiArg = {
  creatorFundRequest: CreatorFundRequest;
};
export type AppealJokeApiResponse = /** status 201 OK */ Appeal;
export type AppealJokeApiArg = {
  id: string;
  createAppealRequest: CreateAppealRequest;
};
export type ListMyAppealsApiResponse = /** status 200 OK */ AppealList;
export type ListMyAppealsApiArg = void;
export type ListAppealsApiResponse = /** status 200 OK */ AppealList;
export type ListAppealsApiArg = {
  status?: "open" | "upheld" | "overturned";
};
export type ResolveAppealApiResponse = /** status 200 OK */ Appeal;
export type ResolveAppealApiArg = {
  id: string;
  resolveAppealRequest: ResolveAppealRequest;
};
export type GetAutomationCatalogApiResponse =
  /** status 200 OK */ AutomationCatalog;
export type GetAutomationCatalogApiArg = void;
export type GetAutomationStatsApiResponse =
  /** status 200 OK */ AutomationStats;
export type GetAutomationStatsApiArg = void;
export type ListWorkflowsApiResponse = /** status 200 OK */ WorkflowList;
export type ListWorkflowsApiArg = void;
export type CreateWorkflowApiResponse = /** status 201 OK */ WorkflowDetail;
export type CreateWorkflowApiArg = {
  createWorkflowRequest: CreateWorkflowRequest;
};
export type GetWorkflowApiResponse = /** status 200 OK */ WorkflowDetail;
export type GetWorkflowApiArg = {
  id: string;
};
export type DeleteWorkflowApiResponse = unknown;
export type DeleteWorkflowApiArg = {
  id: string;
};
export type SaveWorkflowDraftApiResponse = /** status 200 OK */ WorkflowDetail;
export type SaveWorkflowDraftApiArg = {
  id: string;
  updateWorkflowDraftRequest: UpdateWorkflowDraftRequest;
};
export type PublishWorkflowApiResponse =
  /** status 200 OK */ WorkflowPublishResult;
export type PublishWorkflowApiArg = {
  id: string;
};
export type PauseWorkflowApiResponse = /** status 200 OK */ WorkflowDetail;
export type PauseWorkflowApiArg = {
  id: string;
};
export type ActivateWorkflowApiResponse = /** status 200 OK */ WorkflowDetail;
export type ActivateWorkflowApiArg = {
  id: string;
};
export type DiscardWorkflowDraftApiResponse =
  /** status 200 OK */ WorkflowDetail;
export type DiscardWorkflowDraftApiArg = {
  id: string;
};
export type ListWorkflowVersionsApiResponse =
  /** status 200 OK */ WorkflowVersionList;
export type ListWorkflowVersionsApiArg = {
  id: string;
};
export type RestoreWorkflowVersionApiResponse =
  /** status 200 OK */ WorkflowDetail;
export type RestoreWorkflowVersionApiArg = {
  id: string;
  version: number;
};
export type ListWorkflowRunsApiResponse = /** status 200 OK */ WorkflowRunList;
export type ListWorkflowRunsApiArg = {
  id: string;
  status?: "running" | "waiting" | "completed" | "stopped" | "failed";
  limit?: number;
};
export type StartWorkflowRunApiResponse = /** status 201 OK */ Queued;
export type StartWorkflowRunApiArg = {
  id: string;
  startWorkflowRunRequest: StartWorkflowRunRequest;
};
export type ListRunsApiResponse = /** status 200 OK */ WorkflowRunList;
export type ListRunsApiArg = {
  status?: "running" | "waiting" | "completed" | "stopped" | "failed";
  limit?: number;
};
export type GetRunApiResponse = /** status 200 OK */ WorkflowRunDetail;
export type GetRunApiArg = {
  runId: string;
};
export type GetAdminOverviewApiResponse = /** status 200 OK */ AdminOverview;
export type GetAdminOverviewApiArg = void;
export type GetAdminFinanceApiResponse = /** status 200 OK */ AdminFinance;
export type GetAdminFinanceApiArg = {
  days?: number;
};
export type ExportLedgerApiResponse = unknown;
export type ExportLedgerApiArg = {
  days?: number;
};
export type GetAdminEngagementApiResponse =
  /** status 200 OK */ AdminEngagement;
export type GetAdminEngagementApiArg = {
  days?: number;
};
export type ListAdminUsersApiResponse = /** status 200 OK */ AdminUserPage;
export type ListAdminUsersApiArg = {
  q?: string;
  role?: "reader" | "writer" | "curator" | "admin";
  tag?: string;
  status?: "active" | "suspended" | "onboarding";
  page?: number;
  size?: number;
  sort?: string;
};
export type GetAdminUserApiResponse = /** status 200 OK */ AdminUserDetail;
export type GetAdminUserApiArg = {
  id: string;
};
export type SetAdminUserRolesApiResponse = /** status 200 OK */ AdminUserDetail;
export type SetAdminUserRolesApiArg = {
  id: string;
  setRolesRequest: SetRolesRequest;
};
export type SuspendUserApiResponse = /** status 200 OK */ AdminUserDetail;
export type SuspendUserApiArg = {
  id: string;
  suspendRequest: SuspendRequest;
};
export type UnsuspendUserApiResponse = /** status 200 OK */ AdminUserDetail;
export type UnsuspendUserApiArg = {
  id: string;
};
export type TagUserApiResponse = /** status 200 OK */ AdminUserDetail;
export type TagUserApiArg = {
  id: string;
  tag: string;
};
export type UntagUserApiResponse = /** status 200 OK */ AdminUserDetail;
export type UntagUserApiArg = {
  id: string;
  tag: string;
};
export type ListTagsApiResponse = /** status 200 OK */ TagList;
export type ListTagsApiArg = void;
export type ListAuditApiResponse = /** status 200 OK */ AuditPage;
export type ListAuditApiArg = {
  action?: string;
  targetType?: string;
  before?: string;
  limit?: number;
};
export type GetLandingApiResponse = /** status 200 OK */ Landing;
export type GetLandingApiArg = void;
export type StartEmailSignInApiResponse =
  /** status 202 Code sent */ StartEmailResponse;
export type StartEmailSignInApiArg = {
  startEmailRequest: StartEmailRequest;
};
export type VerifyEmailSignInApiResponse = /** status 200 OK */ Session;
export type VerifyEmailSignInApiArg = {
  verifyEmailRequest: VerifyEmailRequest;
};
export type GoogleSignInApiResponse = /** status 200 OK */ Session;
export type GoogleSignInApiArg = {
  googleSignInRequest: GoogleSignInRequest;
};
export type Upload = {
  /** Send this as imageKey when submitting the joke. */
  key: string;
  url: string;
  method: "PUT";
  /** Send these headers with the upload, exactly. */
  headers: {
    [key: string]: string;
  };
  expiresAt: string;
};
export type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  errors?: {
    path: string;
    message: string;
  }[];
};
export type CreateUploadRequest = {
  contentType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  size: number;
};
export type Activity = {
  id: string;
  type:
    | "joke_scheduled"
    | "joke_declined"
    | "joke_delivered"
    | "joke_removed"
    | "new_subscriber"
    | "comment"
    | "tip_received"
    | "payout_paid"
    | "payout_failed"
    | "report_resolved"
    | "appeal_resolved"
    | "automation";
  title: string;
  body: string | null;
  /** Where tapping it should go in the app. */
  url: string;
  actor: {
    name: string;
    handle: string;
    tone: "red" | "navy" | "yellow" | "green" | "denim";
  } | null;
  createdAt: string;
  read: boolean;
};
export type ActivityPage = {
  data: Activity[];
  nextCursor: string | null;
  unread: number;
};
export type PushConfig = {
  enabled: boolean;
  publicKey: string | null;
};
export type PushSubscriptionRequest = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};
export type RemovePushSubscriptionRequest = {
  endpoint: string;
};
export type Preferences = {
  deliveryHour: number;
  jokeOrigin: "everywhere" | "local";
  topics: string[];
};
export type Payout = {
  method: "mpesa";
  phoneLast3: string;
  verified: boolean;
};
export type Me = {
  id: string;
  email: string;
  name: string | null;
  handle: string | null;
  country: string | null;
  bio: string;
  tone: "red" | "navy" | "yellow" | "green" | "denim";
  timezone: string;
  roles: ("reader" | "writer" | "curator" | "admin")[];
  preferences: Preferences;
  payout: Payout | null;
  onboarded: boolean;
  createdAt: string;
};
export type UpdateMeRequest = {
  name?: string;
  handle?: string;
  country?: string;
  bio?: string;
  timezone?: string;
};
export type PayoutMethodRequest = {
  method: "mpesa";
  phone: string;
};
export type CompleteOnboardingRequest = {
  name: string;
  handle: string;
  country: string;
  bio?: string;
  timezone: string;
  roles: ("reader" | "writer")[];
  topics?: string[];
  jokeOrigin?: "everywhere" | "local";
  deliveryHour?: number;
  following?: string[];
  payout?: PayoutMethodRequest;
};
export type ReplaceRolesRequest = {
  roles: ("reader" | "writer")[];
};
export type UpdatePreferencesRequest = {
  deliveryHour?: number;
  jokeOrigin?: "everywhere" | "local";
  topics?: string[];
};
export type HandleAvailability = {
  handle: string;
  available: boolean;
  reason?: "invalid" | "reserved" | "taken";
  suggestion?: string;
};
export type Topic = {
  slug: string;
  label: string;
};
export type TopicList = {
  data: Topic[];
};
export type Creator = {
  id: string;
  name: string;
  handle: string;
  country: string | null;
  bio: string;
  tone: "red" | "navy" | "yellow" | "green" | "denim";
  subscriberCount: number;
  isSubscribed: boolean;
};
export type CreatorPage = {
  data: Creator[];
  nextCursor: string | null;
};
export type CreatorList = {
  data: Creator[];
};
export type Submission = {
  id: string;
  kind: "text" | "image";
  setup: string | null;
  punchline: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  caption: string | null;
  background: "red" | "navy" | "yellow" | "green" | "denim";
  region: string | null;
  topics: string[];
  status: "in_review" | "scheduled" | "delivered" | "declined" | "withdrawn";
  deliverOn: string | null;
  submittedAt: string;
  declineReason:
    | ("possible_copy" | "not_a_dad_joke" | "offensive" | "unclear" | "other")
    | null;
  declineNote: string | null;
  canWithdraw: boolean;
  /** Taken down by curators after it went out. */
  removed: boolean;
  /** Once it has gone out. */
  stats: {
    reached: number;
    opened: number;
    reactions: number;
    comments: number;
  } | null;
};
export type CreateJokeRequest =
  | {
      kind: "text";
      setup: string;
      punchline: string;
      background?: "red" | "navy" | "yellow" | "green" | "denim";
      /** Country whose readers need local knowledge to get it. Null: works everywhere. */
      region?: string | null;
      topics?: string[];
      original: true;
    }
  | {
      kind: "image";
      /** The key from POST /v1/me/uploads, after the file is uploaded. */
      imageKey: string;
      imageAlt: string;
      caption?: string;
      /** Country whose readers need local knowledge to get it. Null: works everywhere. */
      region?: string | null;
      topics?: string[];
      original: true;
    };
export type SubmissionPage = {
  data: Submission[];
  nextCursor: string | null;
};
export type JokeCreator = {
  id: string;
  name: string;
  handle: string;
  country: string | null;
  tone: "red" | "navy" | "yellow" | "green" | "denim";
};
export type CuratedJoke = {
  id: string;
  kind: "text" | "image";
  setup: string | null;
  punchline: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  caption: string | null;
  background: "red" | "navy" | "yellow" | "green" | "denim";
  region: string | null;
  topics: string[];
  status: "in_review" | "scheduled" | "delivered" | "declined" | "withdrawn";
  deliverOn: string | null;
  submittedAt: string;
  declineReason:
    | ("possible_copy" | "not_a_dad_joke" | "offensive" | "unclear" | "other")
    | null;
  declineNote: string | null;
  canWithdraw: boolean;
  /** Taken down by curators after it went out. */
  removed: boolean;
  /** Once it has gone out. */
  stats: {
    reached: number;
    opened: number;
    reactions: number;
    comments: number;
  } | null;
  creator: JokeCreator;
  reviewedAt: string | null;
};
export type PossibleCopy = {
  id: string;
  setup: string | null;
  punchline: string | null;
  status: "in_review" | "scheduled" | "delivered" | "declined" | "withdrawn";
  deliverOn: string | null;
  creatorHandle: string;
  sameWriter: boolean;
  similarity: number;
};
export type QueueItem = {
  joke: CuratedJoke;
  possibleCopies: PossibleCopy[];
};
export type QueuePage = {
  data: QueueItem[];
  nextCursor: string | null;
  waiting: number;
};
export type CurationCalendar = {
  firstOpenDay: string;
  days: {
    date: string;
    picks: {
      jokeId: string;
      region: string | null;
      setup: string | null;
      creatorName: string;
      status:
        "in_review" | "scheduled" | "delivered" | "declined" | "withdrawn";
    }[];
  }[];
};
export type ScheduleJokeRequest = {
  deliverOn: string;
};
export type DeclineJokeRequest = {
  reason:
    "possible_copy" | "not_a_dad_joke" | "offensive" | "unclear" | "other";
  note?: string;
};
export type DeliveryCard = {
  date: string;
  state: "sealed" | "opened" | "missed";
  deliveredAt: string;
  expiresAt: string;
  kind: "text" | "image";
  background: "red" | "navy" | "yellow" | "green" | "denim";
  creator: {
    name: string;
    handle: string;
    tone: "red" | "navy" | "yellow" | "green" | "denim";
  };
  /** Only once opened: the joke stays sealed until then. */
  jokeId: string | null;
};
export type Today = {
  /** The reader's local date. */
  date: string;
  timezone: string;
  deliveryHour: number;
  nextDeliveryAt: string;
  /** Today's joke, or yesterday's if it can still be opened. */
  current: DeliveryCard | null;
  week: {
    date: string;
    state: "sealed" | "opened" | "missed" | "upcoming" | "none";
    creator: {
      name: string;
      tone: "red" | "navy" | "yellow" | "green" | "denim";
    } | null;
    jokeId: string | null;
  }[];
  /** Days in a row with the joke opened. */
  streak: number;
};
export type ReactionCounts = {
  laugh: number;
  groan: number;
  facepalm: number;
  drum: number;
};
export type Joke = {
  id: string;
  kind: "text" | "image";
  setup: string | null;
  punchline: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  caption: string | null;
  background: "red" | "navy" | "yellow" | "green" | "denim";
  region: string | null;
  topics: string[];
  deliverOn: string | null;
  creator: {
    id: string;
    name: string;
    handle: string;
    country: string | null;
    tone: "red" | "navy" | "yellow" | "green" | "denim";
    bio: string;
    subscriberCount: number;
    isSubscribed: boolean;
  };
  stats: {
    views: number;
    reactions: ReactionCounts;
    comments: number;
  };
  myReaction: ("laugh" | "groan" | "facepalm" | "drum") | null;
  isMine: boolean;
};
export type StudioSummary = {
  sent: number;
  picked: number;
  inReview: number;
  /** Readers your jokes were delivered to. */
  reached: number;
  opened: number;
  /** Tips paid for your jokes, before the platform fee. */
  tipsKes: number;
};
export type JokeStats = {
  views: number;
  reactions: ReactionCounts;
  comments: number;
  myReaction: ("laugh" | "groan" | "facepalm" | "drum") | null;
};
export type ReactRequest = {
  kind: "laugh" | "groan" | "facepalm" | "drum";
};
export type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    handle: string;
    tone: "red" | "navy" | "yellow" | "green" | "denim";
  };
  isMine: boolean;
  /** Authors can delete their own comments; admins any. */
  canDelete: boolean;
  /** Curators and admins can hide a comment from readers. */
  canHide: boolean;
  /** Hidden from readers (only staff and the author see it). */
  hidden: boolean;
};
export type CommentPage = {
  data: Comment[];
  nextCursor: string | null;
};
export type CreateCommentRequest = {
  body: string;
};
export type ReportReceipt = {
  alreadyReported: boolean;
  /** It's now hidden from readers while curators review it. */
  hidden: boolean;
};
export type CreateReportRequest = {
  jokeId?: string;
  commentId?: string;
  reason: "copied" | "offensive" | "spam" | "other";
  note?: string;
};
export type EventsAccepted = {
  accepted: number;
};
export type EventsRequest = {
  events: {
    jokeId: string;
    type: "replay" | "share";
    /** When it happened. Defaults to now; clamped to the last day. */
    at?: string;
  }[];
};
export type StudioDaily = {
  data: {
    date: string;
    opens: number;
    reactions: number;
    comments: number;
  }[];
};
export type ReportedItem = {
  target: "joke" | "comment";
  jokeId: string;
  commentId: string | null;
  preview: string;
  authorHandle: string;
  reports: number;
  reasons: {
    [key: string]: number;
  };
  notes: string[];
  firstReportedAt: string;
  /** Hidden from readers automatically, waiting for a decision. */
  hidden: boolean;
  resolution: ("dismissed" | "removed") | null;
  resolvedAt: string | null;
  /** Handle of the curator who decided. */
  resolvedBy: string | null;
};
export type ReportedItemList = {
  data: ReportedItem[];
};
export type ResolveReportsRequest = {
  jokeId?: string;
  commentId?: string;
  action: "dismiss" | "remove";
  /** Why, for the audit log. */
  note?: string;
};
export type DecisionPoint = {
  key: string;
  label: string;
  description: string;
  facts: {
    path: string;
    type: "number" | "text" | "boolean" | "list" | "date";
    label: string;
    example?: any;
  }[];
  outputs: {
    key: string;
    type: "number" | "text" | "boolean" | "list" | "date";
    label: string;
  }[];
};
export type DecisionPointList = {
  data: DecisionPoint[];
};
export type RuleSetSummary = {
  id: string;
  key: string;
  name: string;
  description: string;
  decisionPoint: string;
  /** Used by the app itself; can be edited but not archived. */
  system: boolean;
  status: "draft" | "published" | "archived";
  /** 0 until first published. */
  liveVersion: number;
  ruleCount: number;
  testCount: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  /** Handle of whoever saved it last. */
  updatedBy: string | null;
};
export type RuleSetList = {
  data: RuleSetSummary[];
};
export type RuleCondition = {
  kind: "condition";
  id: string;
  field: string;
  op:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "in"
    | "not_in"
    | "contains"
    | "not_contains"
    | "starts_with"
    | "starts_with_any"
    | "ends_with"
    | "is_empty"
    | "is_not_empty"
    | "is_true"
    | "is_false";
  /** A literal (number, text, true/false, a list), or { ref } to another fact. */
  value?: any;
};
export type RuleGroup = {
  kind: "group";
  id: string;
  match: "all" | "any" | "none";
  items: (RuleCondition | RuleGroup)[];
};
export type RuleOutcome = {
  key: string;
  value: any;
};
export type Rule = {
  id: string;
  name?: string;
  enabled?: boolean;
  when: RuleGroup;
  then: RuleOutcome[];
};
export type RuleTestCase = {
  id: string;
  name: string;
  facts: {
    [key: string]: any;
  };
  /** Outputs that must come out, e.g. { hide: true }. */
  expect: {
    [key: string]: any;
  };
};
export type RuleDefinition = {
  hitPolicy?: "first" | "collect";
  rules: Rule[];
  default?: RuleOutcome[];
  tests?: RuleTestCase[];
};
export type RuleSetDetail = {
  id: string;
  key: string;
  name: string;
  description: string;
  decisionPoint: string;
  /** Used by the app itself; can be edited but not archived. */
  system: boolean;
  status: "draft" | "published" | "archived";
  /** 0 until first published. */
  liveVersion: number;
  ruleCount: number;
  testCount: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  /** Handle of whoever saved it last. */
  updatedBy: string | null;
  /** Send it back when saving, so two people can't overwrite each other. */
  revision: number;
  draft: RuleDefinition;
};
export type CreateRuleSetRequest = {
  key: string;
  name: string;
  description?: string;
  decisionPoint: string;
};
export type UpdateRuleDraftRequest = {
  revision: number;
  name?: string;
  description?: string;
  draft: RuleDefinition;
};
export type RuleEvaluation = {
  /** The version evaluated; null for the draft. */
  version: number | null;
  matched: string[];
  outputs: {
    [key: string]: any;
  };
  usedDefault: boolean;
  trace: {
    ruleId: string;
    name: string;
    enabled: boolean;
    matched: boolean;
    conditions: {
      id: string;
      field: string;
      op: string;
      left: any;
      right: any;
      result: boolean;
    }[];
  }[];
};
export type EvaluateRuleSetRequest = {
  facts: {
    [key: string]: any;
  };
  source?: "draft" | "live";
  definition?: RuleDefinition;
};
export type RuleTestReport = {
  passed: boolean;
  results: {
    id: string;
    name: string;
    passed: boolean;
    outputs: {
      [key: string]: any;
    };
    failures: {
      [key: string]: {
        expected: any;
        actual: any;
      };
    };
  }[];
};
export type RunRuleTestsRequest = {
  definition?: RuleDefinition;
};
export type RulePublishResult = {
  /** False when a test failed; nothing changed then. */
  published: boolean;
  version: number | null;
  tests: RuleTestReport;
};
export type RuleVersionList = {
  data: {
    version: number;
    publishedAt: string;
    publishedBy: string | null;
    ruleCount: number;
  }[];
};
export type RuleVersion = {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  definition: RuleDefinition;
};
export type Tip = {
  id: string;
  jokeId: string;
  amountKes: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
  /** What to tell the tipper about the current status. */
  message: string;
  /** Test mode: no real money moves. Answer the prompt with simulateTipPrompt. */
  simulated: boolean;
  phoneLast3: string;
  createdAt: string;
};
export type CreateTipRequest = {
  amountKes: number;
  /** The M-Pesa number to charge. It gets a prompt to enter the PIN. */
  phone: string;
  /** Shown with the tip under the joke and in the writer's notification. */
  note?: string;
  /** Hide my name on the joke and from the writer. */
  anonymous?: boolean;
};
export type TipWallItem = {
  id: string;
  amountKes: number;
  note: string | null;
  /** The writer or a curator hid the message. */
  noteHidden: boolean;
  anonymous: boolean;
  isMine: boolean;
  /** Null when the tipper chose to stay anonymous. */
  from: {
    name: string;
    handle: string;
    tone: string;
  } | null;
  paidAt: string;
};
export type TipWall = {
  count: number;
  totalKes: number;
  /** The viewer can hide messages (the writer, or a curator). */
  canModerate: boolean;
  data: TipWallItem[];
};
export type HideTipNoteRequest = {
  hidden: boolean;
};
export type SimulateTipPromptRequest = {
  /** What the tipper does on the simulated M-Pesa prompt. */
  answer: "approve" | "cancel" | "insufficient_funds" | "wrong_pin";
};
export type Balance = {
  /** Can be withdrawn now. */
  availableKes: number;
  /** Earned but still on hold; becomes available after the hold. */
  pendingKes: number;
  /** When the next pending earnings become available. */
  nextReleaseAt: string | null;
  holdHours: number;
  /** Everything tipped to you, after the platform fee. */
  lifetimeTipsKes: number;
  /** Everything paid to you from the creator fund. */
  creatorFundKes: number;
  paidOutKes: number;
  pendingPayoutKes: number;
  minimumPayoutKes: number;
  payoutPhoneLast3: string | null;
};
export type PayoutTransfer = {
  id: string;
  amountKes: number;
  phoneLast3: string;
  status: "requested" | "processing" | "paid" | "failed";
  createdAt: string;
  completedAt: string | null;
};
export type PayoutList = {
  data: PayoutTransfer[];
};
export type CreatePayoutRequest = {
  amountKes: number;
};
export type FeePolicy = {
  id: string;
  country: string;
  creator: {
    id: string;
    handle: string | null;
    name: string | null;
  } | null;
  /** Basis points: 1000 = 10%. */
  bps: number;
  note: string;
  effectiveFrom: string;
  supersededAt: string | null;
  /** Paid tips charged at this rate. */
  tips: number;
  createdAt: string;
};
export type FeePolicyList = {
  data: FeePolicy[];
};
export type CreateFeePolicyRequest = {
  bps: number;
  /** Leave out for the default rate; set for one writer's own rate. */
  creatorHandle?: string;
  note?: string;
  /** Defaults to now. Can't be in the past. */
  effectiveFrom?: string;
};
export type ReconciliationCheck = {
  key: string;
  label: string;
  ok: boolean;
  count: number;
  amountKes: number | null;
  detail: string | null;
};
export type ReconciliationRun = {
  id: string;
  status: "ok" | "issues" | "failed";
  checks: ReconciliationCheck[];
  /** Handle of the admin who ran it; null for the daily run. */
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string;
};
export type ReconciliationRunList = {
  data: ReconciliationRun[];
};
export type CreatorFundRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  poolKes: number;
  allocatedKes: number;
  qualifiedViews: number;
  creators: number;
  releasedKes: number;
  createdBy: string | null;
  createdAt: string;
};
export type CreatorFundRunList = {
  data: CreatorFundRun[];
};
export type CreatorFundRequest = {
  periodStart: string;
  periodEnd: string;
  poolKes: number;
};
export type CreatorFundAllocation = {
  creatorId: string;
  handle: string | null;
  name: string | null;
  views: number;
  sharePct: number;
  amountKes: number;
};
export type CreatorFundPreview = {
  periodStart: string;
  periodEnd: string;
  poolKes: number;
  /** Opens by readers other than the writer, of jokes still up, from writers in good standing. */
  qualifiedViews: number;
  allocations: CreatorFundAllocation[];
};
export type Appeal = {
  id: string;
  jokeId: string;
  preview: string;
  authorHandle: string;
  message: string;
  status: "open" | "upheld" | "overturned";
  resolutionNote: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
export type CreateAppealRequest = {
  message: string;
};
export type AppealList = {
  data: Appeal[];
};
export type ResolveAppealRequest = {
  /** uphold keeps it down; overturn puts it back up. */
  decision: "uphold" | "overturn";
  /** Shown to the writer. */
  note?: string;
};
export type AutomationCatalog = {
  triggers: {
    type: string;
    label: string;
    fields: {
      name: string;
      type: "number" | "text" | "boolean" | "list" | "date";
    }[];
  }[];
  steps: {
    type: string;
    category: string;
    label: string;
    description: string;
  }[];
  templates: {
    key: string;
    name: string;
    description: string;
    triggerType: string;
    stepCount: number;
  }[];
  userFacts: {
    path: string;
    type: "number" | "text" | "boolean" | "list" | "date";
    label: string;
  }[];
};
export type AutomationStats = {
  pendingEvents: number;
  waitingRuns: number;
  runs24h: number;
  failed24h: number;
  messages24h: number;
  skippedByPolicy24h: number;
};
export type WorkflowSummary = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused";
  /** The draft's trigger. */
  triggerType: string;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  stepCount: number;
  runs7d: number;
  failed7d: number;
  lastRunAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};
export type WorkflowList = {
  data: WorkflowSummary[];
};
export type FilterStep = {
  id: string;
  type: "filter";
  name?: string;
  when: RuleGroup;
};
export type DecisionStep = {
  id: string;
  type: "decision";
  name?: string;
  ruleSetKey: string;
  /** Stop the run when no rule matched (only the default applied). */
  stopUnlessMatched?: boolean;
};
export type DelayStep = {
  id: string;
  type: "delay";
  minutes: number;
};
export type WaitUntilHourStep = {
  id: string;
  type: "wait_until_hour";
  hour: number;
};
export type SendPushStep = {
  id: string;
  type: "send_push";
  title: string;
  body?: string;
  url?: string;
};
export type SendEmailStep = {
  id: string;
  type: "send_email";
  subject: string;
  body: string;
};
export type NotifyStep = {
  id: string;
  type: "notify";
  title: string;
  body?: string;
  url?: string;
};
export type TagStep = {
  id: string;
  type: "add_tag" | "remove_tag";
  tag: string;
};
export type AlertStaffStep = {
  id: string;
  type: "alert_staff";
  title: string;
  body?: string;
  url?: string;
};
export type WorkflowStep =
  | FilterStep
  | DecisionStep
  | DelayStep
  | WaitUntilHourStep
  | SendPushStep
  | SendEmailStep
  | NotifyStep
  | TagStep
  | AlertStaffStep;
export type WorkflowGraph = {
  trigger: {
    type:
      | "user.signed_up"
      | "delivery.opened"
      | "delivery.unopened"
      | "delivery.missed"
      | "streak.milestone"
      | "subscription.created"
      | "tip.paid"
      | "report.created"
      | "manual";
    when?: RuleGroup;
  };
  steps: WorkflowStep[];
};
export type WorkflowDetail = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused";
  /** The draft's trigger. */
  triggerType: string;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  stepCount: number;
  runs7d: number;
  failed7d: number;
  lastRunAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  revision: number;
  draft: WorkflowGraph;
  liveTriggerType: string | null;
};
export type CreateWorkflowRequest = {
  name: string;
  description?: string;
  templateKey?: string;
};
export type UpdateWorkflowDraftRequest = {
  revision: number;
  name?: string;
  description?: string;
  draft: WorkflowGraph;
};
export type WorkflowPublishResult = {
  published: boolean;
  version: number | null;
  /** Why it couldn't be published. */
  problems: string[];
};
export type WorkflowVersionList = {
  data: {
    version: number;
    publishedAt: string;
    publishedBy: string | null;
    triggerType: string;
    stepCount: number;
  }[];
};
export type WorkflowRun = {
  id: string;
  workflowId: string;
  workflowName: string;
  /** 0 for test runs of the draft. */
  workflowVersion: number;
  status: "running" | "waiting" | "completed" | "stopped" | "failed";
  user: {
    id: string;
    handle: string;
    name: string;
  } | null;
  eventType: string;
  stepIndex: number;
  resumeAt: string | null;
  error: string | null;
  test: boolean;
  startedAt: string;
  finishedAt: string | null;
};
export type WorkflowRunList = {
  data: WorkflowRun[];
};
export type Queued = {
  queued: boolean;
};
export type StartWorkflowRunRequest = {
  /** Who to run it for. Defaults to you. */
  userId?: string;
  /** test runs the draft and skips waits; live runs the published version. */
  mode?: "test" | "live";
};
export type WorkflowRunDetail = {
  id: string;
  workflowId: string;
  workflowName: string;
  /** 0 for test runs of the draft. */
  workflowVersion: number;
  status: "running" | "waiting" | "completed" | "stopped" | "failed";
  user: {
    id: string;
    handle: string;
    name: string;
  } | null;
  eventType: string;
  stepIndex: number;
  resumeAt: string | null;
  error: string | null;
  test: boolean;
  startedAt: string;
  finishedAt: string | null;
  event: {
    [key: string]: any;
  };
  steps: {
    stepIndex: number;
    stepId: string;
    type: string;
    status: string;
    output: any;
    error: string | null;
    at: string;
  }[];
};
export type AdminOverview = {
  people: {
    total: number;
    new7d: number;
    readers: number;
    writers: number;
    suspended: number;
  };
  today: {
    /** Jokes delivered in the last 24 hours. */
    delivered: number;
    opened: number;
    /** Share of delivered jokes opened, last 7 days (0-1). */
    openRate7d: number;
  };
  streaks: {
    active3plus: number;
    longest: number;
  };
  queue: {
    inReview: number;
    scheduledAhead: number;
    /** Of the next 7 days. */
    daysWithoutPick: number;
  };
  moderation: {
    openReports: number;
    hidden: number;
    openAppeals: number;
  };
  money: {
    tips24hKes: number;
    tips30dKes: number;
    fees30dKes: number;
    owedToWritersKes: number;
  };
  series: {
    date: string;
    signups: number;
    opens: number;
    tipsKes: number;
  }[];
};
export type AdminFinance = {
  days: number;
  totals: {
    tipsKes: number;
    tipCount: number;
    feesKes: number;
    writerEarningsKes: number;
    payoutsPaidKes: number;
    payoutsPendingKes: number;
    payoutsFailed: number;
    tipsFailed: number;
    /** Every writer balance combined, now. */
    owedToWritersKes: number;
    /** Net money through M-Pesa: tips in minus payouts out, all time. */
    clearingKes: number;
  };
  series: {
    date: string;
    tipsKes: number;
    feesKes: number;
    payoutsKes: number;
  }[];
  topWriters: {
    id: string;
    handle: string;
    name: string;
    tipsKes: number;
    tips: number;
    balanceKes: number;
  }[];
  payouts: {
    id: string;
    handle: string;
    amountKes: number;
    status: "requested" | "processing" | "paid" | "failed";
    resultDesc: string | null;
    createdAt: string;
    completedAt: string | null;
  }[];
};
export type AdminEngagement = {
  days: number;
  daily: {
    date: string;
    delivered: number;
    opened: number;
    reactions: number;
    comments: number;
  }[];
  streakBuckets: {
    label: string;
    readers: number;
  }[];
  topStreaks: {
    id: string;
    handle: string;
    name: string;
    streak: number;
  }[];
  topJokes: {
    id: string;
    preview: string;
    handle: string;
    deliverOn: string | null;
    opens: number;
    reactions: number;
    comments: number;
    shares: number;
  }[];
  reactions: {
    [key: string]: number;
  };
  automation: {
    messages: number;
    byChannel: {
      [key: string]: number;
    };
  };
};
export type AdminUserRow = {
  id: string;
  name: string;
  handle: string | null;
  email: string;
  country: string | null;
  tone: "red" | "navy" | "yellow" | "green" | "denim";
  roles: ("reader" | "writer" | "curator" | "admin")[];
  tags: string[];
  streak: number;
  lastOpenAt: string | null;
  onboarded: boolean;
  suspended: boolean;
  createdAt: string;
};
export type AdminUserPage = {
  data: AdminUserRow[];
  total: number;
  page: number;
  size: number;
};
export type AdminUserDetail = {
  id: string;
  name: string;
  handle: string | null;
  email: string;
  country: string | null;
  tone: "red" | "navy" | "yellow" | "green" | "denim";
  roles: ("reader" | "writer" | "curator" | "admin")[];
  tags: string[];
  streak: number;
  lastOpenAt: string | null;
  onboarded: boolean;
  suspended: boolean;
  createdAt: string;
  bio: string;
  timezone: string;
  deliveryHour: number | null;
  suspendedReason: string | null;
  suspendedAt: string | null;
  stats: {
    opens: number;
    missed7d: number;
    subscriptions: number;
    subscribers: number;
    tipsSent: number;
    tipsSentKes: number;
    tipsReceivedKes: number;
    balanceKes: number;
    jokesSubmitted: number;
    jokesDelivered: number;
    jokesRemoved: number;
    reportsAgainst: number;
    reportsFiled: number;
  };
  messages: {
    channel: string;
    title: string;
    workflowName: string | null;
    sentAt: string;
  }[];
  runs: {
    id: string;
    workflowName: string;
    status: string;
    startedAt: string;
  }[];
  audit: {
    action: string;
    actor: string | null;
    data: {
      [key: string]: any;
    };
    createdAt: string;
  }[];
};
export type SetRolesRequest = {
  roles: ("reader" | "writer" | "curator" | "admin")[];
};
export type SuspendRequest = {
  reason: string;
};
export type TagList = {
  data: {
    tag: string;
    people: number;
  }[];
};
export type AuditEntry = {
  id: string;
  /** Null when the system did it. */
  actor: {
    id: string;
    handle: string;
  } | null;
  action: string;
  targetType: string;
  targetId: string;
  data: {
    [key: string]: any;
  };
  createdAt: string;
};
export type AuditPage = {
  data: AuditEntry[];
  nextBefore: string | null;
};
export type Landing = {
  /** A recent favourite to show on the landing page. */
  sample: {
    setup: string;
    punchline: string;
    background: "red" | "navy" | "yellow" | "green" | "denim";
    writer: string;
  } | null;
  stats: {
    readers: number;
    writers: number;
    jokesDelivered: number;
    reactions: number;
  };
  writers: {
    name: string;
    handle: string;
    tone: "red" | "navy" | "yellow" | "green" | "denim";
    subscribers: number;
  }[];
};
export type StartEmailResponse = {
  expiresInSeconds: number;
  resendAfterSeconds: number;
};
export type StartEmailRequest = {
  email: string;
};
export type Session = {
  accessToken: string;
  expiresInSeconds: number;
  isNew: boolean;
  user: Me;
};
export type VerifyEmailRequest = {
  email: string;
  code: string;
};
export type GoogleSignInRequest = {
  idToken: string;
};
export const {
  useCreateUploadMutation,
  useListActivityQuery,
  useLazyListActivityQuery,
  useMarkActivityReadMutation,
  useGetPushConfigQuery,
  useLazyGetPushConfigQuery,
  useAddPushSubscriptionMutation,
  useRemovePushSubscriptionMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useUpdateMeMutation,
  useCompleteOnboardingMutation,
  useReplaceMyRolesMutation,
  useUpdateMyPreferencesMutation,
  useSetMyPayoutMethodMutation,
  useRemoveMyPayoutMethodMutation,
  useCheckHandleQuery,
  useLazyCheckHandleQuery,
  useListTopicsQuery,
  useLazyListTopicsQuery,
  useListCreatorsQuery,
  useLazyListCreatorsQuery,
  useGetCreatorQuery,
  useLazyGetCreatorQuery,
  useListMySubscriptionsQuery,
  useLazyListMySubscriptionsQuery,
  useSubscribeMutation,
  useUnsubscribeMutation,
  useSubmitJokeMutation,
  useListMyJokesQuery,
  useLazyListMyJokesQuery,
  useGetMyJokeQuery,
  useLazyGetMyJokeQuery,
  useWithdrawMyJokeMutation,
  useGetReviewQueueQuery,
  useLazyGetReviewQueueQuery,
  useGetCurationCalendarQuery,
  useLazyGetCurationCalendarQuery,
  useGetCuratedJokeQuery,
  useLazyGetCuratedJokeQuery,
  useScheduleJokeMutation,
  useDeclineJokeMutation,
  useGetTodayQuery,
  useLazyGetTodayQuery,
  useOpenDeliveryMutation,
  useGetStudioSummaryQuery,
  useLazyGetStudioSummaryQuery,
  useGetJokeQuery,
  useLazyGetJokeQuery,
  useReactMutation,
  useUnreactMutation,
  useListCommentsQuery,
  useLazyListCommentsQuery,
  useAddCommentMutation,
  useLiveStatsQuery,
  useLazyLiveStatsQuery,
  useDeleteCommentMutation,
  useReportMutation,
  useRecordEventsMutation,
  useGetStudioDailyQuery,
  useLazyGetStudioDailyQuery,
  useListReportsQuery,
  useLazyListReportsQuery,
  useHideCommentMutation,
  useUnhideCommentMutation,
  useResolveReportsMutation,
  useListDecisionPointsQuery,
  useLazyListDecisionPointsQuery,
  useListRuleSetsQuery,
  useLazyListRuleSetsQuery,
  useCreateRuleSetMutation,
  useGetRuleSetQuery,
  useLazyGetRuleSetQuery,
  useSaveRuleDraftMutation,
  useEvaluateRuleSetMutation,
  useTestRuleSetMutation,
  usePublishRuleSetMutation,
  useArchiveRuleSetMutation,
  useUnarchiveRuleSetMutation,
  useListRuleVersionsQuery,
  useLazyListRuleVersionsQuery,
  useGetRuleVersionQuery,
  useLazyGetRuleVersionQuery,
  useRestoreRuleVersionMutation,
  useTipJokeMutation,
  useListJokeTipsQuery,
  useLazyListJokeTipsQuery,
  useSetTipNoteHiddenMutation,
  useSimulateTipPromptMutation,
  useGetTipQuery,
  useLazyGetTipQuery,
  useGetBalanceQuery,
  useLazyGetBalanceQuery,
  useListPayoutsQuery,
  useLazyListPayoutsQuery,
  useRequestPayoutMutation,
  useListFeePoliciesQuery,
  useLazyListFeePoliciesQuery,
  useCreateFeePolicyMutation,
  useListReconciliationsQuery,
  useLazyListReconciliationsQuery,
  useRunReconciliationMutation,
  useListCreatorFundRunsQuery,
  useLazyListCreatorFundRunsQuery,
  usePostCreatorFundMutation,
  usePreviewCreatorFundMutation,
  useAppealJokeMutation,
  useListMyAppealsQuery,
  useLazyListMyAppealsQuery,
  useListAppealsQuery,
  useLazyListAppealsQuery,
  useResolveAppealMutation,
  useGetAutomationCatalogQuery,
  useLazyGetAutomationCatalogQuery,
  useGetAutomationStatsQuery,
  useLazyGetAutomationStatsQuery,
  useListWorkflowsQuery,
  useLazyListWorkflowsQuery,
  useCreateWorkflowMutation,
  useGetWorkflowQuery,
  useLazyGetWorkflowQuery,
  useDeleteWorkflowMutation,
  useSaveWorkflowDraftMutation,
  usePublishWorkflowMutation,
  usePauseWorkflowMutation,
  useActivateWorkflowMutation,
  useDiscardWorkflowDraftMutation,
  useListWorkflowVersionsQuery,
  useLazyListWorkflowVersionsQuery,
  useRestoreWorkflowVersionMutation,
  useListWorkflowRunsQuery,
  useLazyListWorkflowRunsQuery,
  useStartWorkflowRunMutation,
  useListRunsQuery,
  useLazyListRunsQuery,
  useGetRunQuery,
  useLazyGetRunQuery,
  useGetAdminOverviewQuery,
  useLazyGetAdminOverviewQuery,
  useGetAdminFinanceQuery,
  useLazyGetAdminFinanceQuery,
  useExportLedgerQuery,
  useLazyExportLedgerQuery,
  useGetAdminEngagementQuery,
  useLazyGetAdminEngagementQuery,
  useListAdminUsersQuery,
  useLazyListAdminUsersQuery,
  useGetAdminUserQuery,
  useLazyGetAdminUserQuery,
  useSetAdminUserRolesMutation,
  useSuspendUserMutation,
  useUnsuspendUserMutation,
  useTagUserMutation,
  useUntagUserMutation,
  useListTagsQuery,
  useLazyListTagsQuery,
  useListAuditQuery,
  useLazyListAuditQuery,
  useGetLandingQuery,
  useLazyGetLandingQuery,
  useStartEmailSignInMutation,
  useVerifyEmailSignInMutation,
  useGoogleSignInMutation,
} = injectedRtkApi;
