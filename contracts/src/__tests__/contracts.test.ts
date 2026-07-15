import { Check } from 'typebox/schema';
import { describe, expect, it } from 'vitest';
import {
  CheckIssueSchema,
  ComparisonModeSchema,
  ContainerDetailResponseSchema,
  ContainerDetailSchema,
  ContainerStatusSchema,
  ContainerSummarySchema,
  ContainersResponseSchema,
  DataStateSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  HomepageWidgetResponseSchema,
  RefreshMetaSchema,
  RefreshResponseSchema,
  RepositoryBodySchema,
  RepositoryResponseSchema,
  UpdateKindSchema,
} from '../index.js';

const refresh = {
  state: 'idle',
  scope: null,
  containerId: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};
const summary = {
  id: 'compose.yml::app',
  name: 'app',
  image: 'owner/app:1.0.0',
  currentVersion: '1.0.0',
  composeFile: 'compose.yml',
  githubRepo: 'owner/app',
  iconUrl: '/icons/app.png',
  latestUpstreamVersion: '1.1.0',
  publishedAt: '2026-01-01T00:00:00.000Z',
  status: 'update-available',
  dataState: 'fresh',
  updateKind: 'minor',
  comparisonMode: 'exact',
  checkIssue: null,
  breakingChangeCount: 0,
  releaseUrl: 'https://example.test/v1.1.0',
  lastChecked: '2026-01-01T00:00:00.000Z',
};
const detail = {
  ...summary,
  historyComplete: true,
  releaseName: 'v1.1.0',
  releaseNotes: 'Notes',
  breakingChanges: [],
};
const meta = { refresh, refreshedAt: '2026-01-01T00:00:00.000Z', githubRateLimit: null };

describe('contract enums', () => {
  it.each(['up-to-date', 'ahead', 'update-available', 'breaking-change', 'unknown', 'no-repo'])(
    'accepts container status %s',
    (value) => expect(Check(ContainerStatusSchema, value)).toBe(true),
  );
  it.each(['pending', 'fresh', 'stale', 'error', 'unlinked'])('accepts data state %s', (value) =>
    expect(Check(DataStateSchema, value)).toBe(true),
  );
  it.each(['exact', 'normalized', 'unverifiable'])('accepts comparison mode %s', (value) =>
    expect(Check(ComparisonModeSchema, value)).toBe(true),
  );
  it.each(['major', 'minor', 'patch', 'prerelease', null])('accepts update kind %s', (value) =>
    expect(Check(UpdateKindSchema, value)).toBe(true),
  );
  it.each([
    'repo-not-found',
    'rate-limited',
    'timeout',
    'network',
    'github-error',
    'invalid-release',
    'unverifiable-version',
  ])('accepts issue code %s', (code) =>
    expect(Check(CheckIssueSchema, { code, message: 'Issue', retryAt: null })).toBe(true),
  );
});

describe('repository mapping contract', () => {
  it.each([
    'owner/repo',
    'open-ai/codex',
    'a/b',
    'owner.name/repo_name',
    'Owner/Repo',
    '123/456',
    'owner/repo.js',
    'owner_1/repo-2',
    'x/y.z',
    'selfhosted/app2',
  ])('accepts repository %s', (repo) => expect(Check(RepositoryBodySchema, { repo })).toBe(true));

  it.each([
    '',
    'repo',
    '/repo',
    'owner/',
    'owner//repo',
    'owner/repo/extra',
    'owner repo/app',
    'owner/repo name',
    '.owner/repo',
    'owner/.repo',
    '-owner/repo',
    'owner/-repo',
    'owner@host/repo',
    'owner\\repo',
    'a/'.padEnd(205, 'x'),
  ])('rejects repository %s', (repo) => expect(Check(RepositoryBodySchema, { repo })).toBe(false));
});

describe('summary and detail contracts', () => {
  it.each([
    ['id', null],
    ['name', null],
    ['image', null],
    ['currentVersion', null],
    ['composeFile', null],
    ['githubRepo', 1],
    ['iconUrl', 1],
    ['latestUpstreamVersion', 1],
    ['publishedAt', 1],
    ['status', 'invalid'],
    ['dataState', 'invalid'],
    ['updateKind', 'invalid'],
    ['comparisonMode', 'invalid'],
    ['checkIssue', {}],
    ['breakingChangeCount', -1],
    ['releaseUrl', 1],
    ['lastChecked', 1],
    ['extra', true],
  ])('rejects malformed summary field %s', (field, value) => {
    expect(Check(ContainerSummarySchema, { ...summary, [field]: value })).toBe(false);
  });

  it.each([
    ['historyComplete', 'yes'],
    ['releaseName', 1],
    ['releaseNotes', 1],
    ['breakingChanges', [{}]],
  ])('rejects malformed detail field %s', (field, value) => {
    expect(Check(ContainerDetailSchema, { ...detail, [field]: value })).toBe(false);
  });
});

describe('refresh metadata contract', () => {
  it.each([
    ['state', 'queued'],
    ['scope', 'repo'],
    ['containerId', 1],
    ['startedAt', 1],
    ['finishedAt', 1],
    ['error', {}],
  ])('rejects malformed refresh field %s', (field, value) => {
    expect(Check(RefreshMetaSchema, { ...refresh, [field]: value })).toBe(false);
  });
});

describe('Homepage widget contract', () => {
  const response = { data: { breaking: 1, updates: 2, checkFailed: 3 } };

  it('accepts non-negative aggregate counts', () => {
    expect(Check(HomepageWidgetResponseSchema, response)).toBe(true);
  });

  it.each([
    ['breaking', -1],
    ['updates', 1.5],
    ['checkFailed', '3'],
    ['extra', 0],
  ])('rejects malformed count field %s', (field, value) => {
    expect(
      Check(HomepageWidgetResponseSchema, {
        data: { ...response.data, [field]: value },
      }),
    ).toBe(false);
  });
});

const responses = [
  ['containers', ContainersResponseSchema, { data: [summary], meta }],
  [
    'Homepage widget',
    HomepageWidgetResponseSchema,
    { data: { breaking: 1, updates: 2, checkFailed: 3 } },
  ],
  ['detail', ContainerDetailResponseSchema, { data: detail }],
  ['refresh', RefreshResponseSchema, { data: refresh }],
  ['repository', RepositoryResponseSchema, { data: summary, meta: { refresh } }],
  ['health', HealthResponseSchema, { data: { status: 'ok', version: '3.0.0' } }],
  ['error', ErrorResponseSchema, { error: { code: 'NOT_FOUND', message: 'Missing' } }],
] as const;

describe('response envelopes', () => {
  it.each(responses)('accepts the %s response', (_name, schema, value) => {
    expect(Check(schema, value)).toBe(true);
  });
  it.each(responses)('rejects additional properties in the %s response', (_name, schema, value) => {
    expect(Check(schema, { ...value, extra: true })).toBe(false);
  });
  it.each([
    ['summary', ContainerSummarySchema, null],
    ['detail', ContainerDetailSchema, []],
    ['refresh', RefreshMetaSchema, 'running'],
    ['containers response', ContainersResponseSchema, []],
    ['detail response', ContainerDetailResponseSchema, null],
    ['refresh response', RefreshResponseSchema, 202],
    ['repository response', RepositoryResponseSchema, false],
    ['health response', HealthResponseSchema, 'ok'],
    ['error response', ErrorResponseSchema, new Error('bad')],
    ['repository body', RepositoryBodySchema, 'owner/repo'],
  ] as const)('rejects a non-object %s root', (_name, schema, value) => {
    expect(Check(schema, value)).toBe(false);
  });
});
