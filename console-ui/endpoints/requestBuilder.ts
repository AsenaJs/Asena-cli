import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import type { DevtoolsRoute } from '../../lib/console/protocol';

export interface KeyValue {
  key: string;
  value: string;
  /** Unticked rows stay in the form but are not sent; absent means sent. */
  enabled?: boolean;
}

const isSent = (row: KeyValue): boolean => row.enabled !== false && row.key.trim() !== '';

/** What the request form holds for one route. */
export interface RequestDraft {
  method: string;
  /** By parameter name; the wildcard is `*`. */
  params: Record<string, string>;
  query: KeyValue[];
  headers: KeyValue[];
  body: string;
}

export interface PathParam {
  name: string;
  optional: boolean;
  wildcard: boolean;
}

export const ALL_METHOD_CHOICES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

export const WILDCARD = '*';

// `:name`, optionally followed by a `{regex}` constraint and a `?` that makes it optional.
export const PARAM_SEGMENT = /^:([A-Za-z_$][\w$]*)(?:\{[^}]*\})?(\?)?$/;

export const methodHasBody = (method: string): boolean => !['GET', 'HEAD'].includes(method.toUpperCase());

export const pathParams = (path: string): PathParam[] =>
  path.split('/').flatMap((segment): PathParam[] => {
    if (segment === WILDCARD) return [{ name: WILDCARD, optional: true, wildcard: true }];

    const match = PARAM_SEGMENT.exec(segment);

    return match?.[1] ? [{ name: match[1], optional: match[2] === '?', wildcard: false }] : [];
  });

export const draftFor = (route: DevtoolsRoute): RequestDraft => {
  const method = route.httpMethod === 'ALL' ? 'GET' : route.httpMethod;

  return {
    method,
    params: Object.fromEntries(pathParams(route.path).map((param) => [param.name, ''])),
    query: [],
    headers: [],
    body: route.hasBodySchema && methodHasBody(method) ? '{}' : '',
  };
};

/** Path values and method to start a route's form from, e.g. from a replayed request. */
export interface RoutePrefill {
  params?: Record<string, string>;
  method?: string;
}

export const prefilledDraft = (route: DevtoolsRoute, prefill: RoutePrefill | undefined): RequestDraft => {
  const draft = draftFor(route);
  const params = Object.fromEntries(
    Object.keys(draft.params).map((name) => [name, prefill?.params?.[name] ?? draft.params[name] ?? '']),
  );
  const method =
    route.httpMethod === 'ALL' && prefill?.method && (ALL_METHOD_CHOICES as readonly string[]).includes(prefill.method)
      ? prefill.method
      : draft.method;

  return { ...draft, params, method };
};

/** A route's form as the user left it: the draft, the prefills it started from, and the prefill those came from. */
export interface SavedDraft {
  draft: RequestDraft;
  from: RequestDraft;
  prefill?: RoutePrefill;
}

/** By route key. */
export type SavedDrafts = Record<string, SavedDraft>;

/**
 * `draft` moved from the prefills in `from` to those in `to`: what the user changed stays, what they left alone follows
 * `to`, and a parameter `to` does not have goes.
 */
export const reconcileDraft = (draft: RequestDraft, from: RequestDraft, to: RequestDraft): RequestDraft => ({
  ...draft,
  method: draft.method === from.method ? to.method : draft.method,
  params: Object.fromEntries(
    Object.entries(to.params).map(([name, prefill]) => {
      const value = draft.params[name];

      return [name, value === undefined || value === from.params[name] ? prefill : value];
    }),
  ),
  body: draft.body === from.body ? to.body : draft.body,
});

/** Fills the path parameters in, each value percent-encoded; the wildcard keeps its slashes. */
export const fillPath = (path: string, params: Record<string, string>): { path: string; missing: string[] } => {
  const missing: string[] = [];
  const segments = path.split('/').flatMap((segment): string[] => {
    if (segment === WILDCARD) {
      return [(params[WILDCARD] ?? '').split('/').map(encodeURIComponent).join('/')];
    }

    const match = PARAM_SEGMENT.exec(segment);
    const name = match?.[1];

    if (!name) return [segment];

    const value = params[name] ?? '';

    if (value !== '') return [encodeURIComponent(value)];
    if (match[2] === '?') return [];

    missing.push(name);

    return [segment];
  });

  return { path: segments.join('/') || '/', missing };
};

const toRecord = (rows: KeyValue[]): Record<string, string> =>
  Object.fromEntries(rows.filter(isSent).map((row) => [row.key.trim(), row.value]));

/** Keys that appear more than once; the contract carries a record, so only the last value of each is sent. */
export const repeatedKeys = (rows: KeyValue[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const row of rows) {
    const key = row.key.trim();

    if (!isSent(row)) continue;
    if (seen.has(key)) repeated.add(key);

    seen.add(key);
  }

  return [...repeated];
};

export type BuiltRequest = { ok: true; request: ConsoleHttpRequest } | { ok: false; missing: string[] };

export const buildRequest = (route: DevtoolsRoute, draft: RequestDraft): BuiltRequest => {
  const { path, missing } = fillPath(route.path, draft.params);

  if (missing.length > 0) return { ok: false, missing };

  const method = route.httpMethod === 'ALL' ? draft.method : route.httpMethod;
  const body = methodHasBody(method) ? draft.body : '';
  const headers = toRecord(draft.headers);
  const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');

  if (body !== '' && !hasContentType) headers['content-type'] = 'application/json';

  return { ok: true, request: { method, path, query: toRecord(draft.query), headers, body } };
};

/** The URL the app sees, for display: the path plus the query encoded as a form would encode it. */
export const requestUrl = (request: Pick<ConsoleHttpRequest, 'path' | 'query'>): string => {
  const query = new URLSearchParams(request.query).toString();

  return query === '' ? request.path : `${request.path}?${query}`;
};

/** Why `body` is not JSON, or `null` when it is (or is empty). */
export const jsonProblem = (body: string): string | null => {
  if (body.trim() === '') return null;

  try {
    JSON.parse(body);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export const prettyBody = (body: string): string => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
};
