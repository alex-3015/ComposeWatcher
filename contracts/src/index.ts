import Type from 'typebox';

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const ContainerStatusSchema = Type.Union([
  Type.Literal('up-to-date'),
  Type.Literal('ahead'),
  Type.Literal('update-available'),
  Type.Literal('breaking-change'),
  Type.Literal('unknown'),
  Type.Literal('no-repo'),
]);
export type ContainerStatus = Type.Static<typeof ContainerStatusSchema>;

export const DataStateSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('fresh'),
  Type.Literal('stale'),
  Type.Literal('error'),
  Type.Literal('unlinked'),
]);
export type DataState = Type.Static<typeof DataStateSchema>;

export const UpdateKindSchema = Type.Union([
  Type.Literal('major'),
  Type.Literal('minor'),
  Type.Literal('patch'),
  Type.Literal('prerelease'),
  Type.Null(),
]);
export type UpdateKind = Type.Static<typeof UpdateKindSchema>;

export const ComparisonModeSchema = Type.Union([
  Type.Literal('exact'),
  Type.Literal('normalized'),
  Type.Literal('unverifiable'),
]);
export type ComparisonMode = Type.Static<typeof ComparisonModeSchema>;

export const CheckIssueCodeSchema = Type.Union([
  Type.Literal('repo-not-found'),
  Type.Literal('rate-limited'),
  Type.Literal('timeout'),
  Type.Literal('network'),
  Type.Literal('github-error'),
  Type.Literal('invalid-release'),
  Type.Literal('unverifiable-version'),
]);
export type CheckIssueCode = Type.Static<typeof CheckIssueCodeSchema>;

export const CheckIssueSchema = Type.Object(
  {
    code: CheckIssueCodeSchema,
    message: Type.String(),
    retryAt: NullableString,
  },
  { additionalProperties: false },
);
export type CheckIssue = Type.Static<typeof CheckIssueSchema>;

export const ApiErrorSchema = Type.Object(
  { code: Type.String(), message: Type.String() },
  { additionalProperties: false },
);
export type ApiError = Type.Static<typeof ApiErrorSchema>;

export const BreakingChangeSchema = Type.Object(
  {
    version: Type.String(),
    releaseName: NullableString,
    reason: Type.String(),
    releaseUrl: Type.String(),
  },
  { additionalProperties: false },
);
export type BreakingChange = Type.Static<typeof BreakingChangeSchema>;

export const GithubRateLimitSchema = Type.Object(
  {
    limit: Type.Number(),
    remaining: Type.Number(),
    resetAt: Type.String(),
    observedAt: Type.String(),
  },
  { additionalProperties: false },
);
export type GithubRateLimit = Type.Static<typeof GithubRateLimitSchema>;

const SummaryFields = {
  id: Type.String(),
  name: Type.String(),
  image: Type.String(),
  currentVersion: Type.String(),
  composeFile: Type.String(),
  githubRepo: NullableString,
  iconUrl: NullableString,
  latestUpstreamVersion: NullableString,
  publishedAt: NullableString,
  status: ContainerStatusSchema,
  dataState: DataStateSchema,
  updateKind: UpdateKindSchema,
  comparisonMode: ComparisonModeSchema,
  checkIssue: Type.Union([CheckIssueSchema, Type.Null()]),
  breakingChangeCount: Type.Integer({ minimum: 0 }),
  releaseUrl: NullableString,
  lastChecked: NullableString,
};

export const ContainerSummarySchema = Type.Object(SummaryFields, {
  additionalProperties: false,
});
export type ContainerSummary = Type.Static<typeof ContainerSummarySchema>;

export const ContainerDetailSchema = Type.Object(
  {
    ...SummaryFields,
    historyComplete: Type.Union([Type.Boolean(), Type.Null()]),
    releaseName: NullableString,
    releaseNotes: NullableString,
    breakingChanges: Type.Array(BreakingChangeSchema),
  },
  { additionalProperties: false },
);
export type ContainerDetail = Type.Static<typeof ContainerDetailSchema>;

export const RefreshStateSchema = Type.Union([
  Type.Literal('idle'),
  Type.Literal('running'),
  Type.Literal('failed'),
]);
export type RefreshState = Type.Static<typeof RefreshStateSchema>;

export const RefreshScopeSchema = Type.Union([
  Type.Literal('all'),
  Type.Literal('container'),
  Type.Null(),
]);
export type RefreshScope = Type.Static<typeof RefreshScopeSchema>;

export const RefreshMetaSchema = Type.Object(
  {
    state: RefreshStateSchema,
    scope: RefreshScopeSchema,
    containerId: NullableString,
    startedAt: NullableString,
    finishedAt: NullableString,
    error: Type.Union([ApiErrorSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type RefreshMeta = Type.Static<typeof RefreshMetaSchema>;

export const ContainersMetaSchema = Type.Object(
  {
    refresh: RefreshMetaSchema,
    refreshedAt: NullableString,
    githubRateLimit: Type.Union([GithubRateLimitSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type ContainersMeta = Type.Static<typeof ContainersMetaSchema>;

export const ContainersResponseSchema = Type.Object(
  {
    data: Type.Array(ContainerSummarySchema),
    meta: ContainersMetaSchema,
  },
  { additionalProperties: false },
);
export type ContainersResponse = Type.Static<typeof ContainersResponseSchema>;

export const HomepageWidgetDataSchema = Type.Object(
  {
    breaking: Type.Integer({ minimum: 0 }),
    updates: Type.Integer({ minimum: 0 }),
    checkFailed: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type HomepageWidgetData = Type.Static<typeof HomepageWidgetDataSchema>;

export const HomepageWidgetResponseSchema = Type.Object(
  { data: HomepageWidgetDataSchema },
  { additionalProperties: false },
);
export type HomepageWidgetResponse = Type.Static<typeof HomepageWidgetResponseSchema>;

export const ContainerDetailResponseSchema = Type.Object(
  { data: ContainerDetailSchema },
  { additionalProperties: false },
);
export type ContainerDetailResponse = Type.Static<typeof ContainerDetailResponseSchema>;

export const RefreshResponseSchema = Type.Object(
  { data: RefreshMetaSchema },
  { additionalProperties: false },
);
export type RefreshResponse = Type.Static<typeof RefreshResponseSchema>;

export const RepositoryBodySchema = Type.Object(
  {
    repo: Type.Union([
      Type.String({
        minLength: 3,
        maxLength: 200,
        pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*\\/[a-zA-Z0-9][a-zA-Z0-9._-]*$',
      }),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);
export type RepositoryBody = Type.Static<typeof RepositoryBodySchema>;

export const RepositoryResponseSchema = Type.Object(
  {
    data: ContainerSummarySchema,
    meta: Type.Object({ refresh: RefreshMetaSchema }, { additionalProperties: false }),
  },
  { additionalProperties: false },
);
export type RepositoryResponse = Type.Static<typeof RepositoryResponseSchema>;

export const HealthResponseSchema = Type.Object(
  {
    data: Type.Object(
      { status: Type.Literal('ok'), version: Type.Literal('3.0.0') },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type HealthResponse = Type.Static<typeof HealthResponseSchema>;

export const ErrorResponseSchema = Type.Object(
  { error: ApiErrorSchema },
  { additionalProperties: false },
);
export type ErrorResponse = Type.Static<typeof ErrorResponseSchema>;
