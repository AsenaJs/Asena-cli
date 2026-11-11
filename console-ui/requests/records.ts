import type { ConsoleRequestRecord, ConsoleRun } from '../../lib/console/hostProtocol';
import type {
  DevtoolsRequestRecord,
  DevtoolsRequestStep,
  DevtoolsRoute,
  DevtoolsStepKind,
} from '../../lib/console/protocol';
import { PARAM_SEGMENT, WILDCARD } from '../endpoints/requestBuilder';
import { routeKey } from '../graph/buildGraph';

export const STEP_LABELS: Record<DevtoolsStepKind, string> = {
  'global-middleware': 'Global middleware',
  middleware: 'Middleware',
  validator: 'Validator',
  controller: 'Handler',
  catch: '@Catch',
  'config-onError': '@Config.onError',
  'adapter-default': 'Adapter default',
  'not-found': 'Not found',
};

/** Records core frames for `@On`, `@Schedule`, `@MessagePattern` and `@EventPattern`, with the event, job or pattern as the path. */
export const isDispatch = (record: Pick<DevtoolsRequestRecord, 'method'>): boolean => record.method.startsWith('@');

export const statusClass = (status: number): string => `${Math.floor(status / 100)}xx`;

export const MAIN_STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'] as const;

export interface RequestFilter {
  /** Status classes switched off, so a class that shows up later is shown. */
  hiddenClasses: ReadonlySet<string>;
  /** `''` for every method. */
  method: string;
  text: string;
  /** Left out or `''` for every server. */
  serverId?: string;
}

const searchable = (record: DevtoolsRequestRecord): string =>
  [record.id, record.method, record.path, String(record.status), ...record.steps.map((step) => step.name)]
    .join('\n')
    .toLowerCase();

/** The matching records, newest first. */
export const filterRequests = (records: ConsoleRequestRecord[], filter: RequestFilter): ConsoleRequestRecord[] => {
  const text = filter.text.trim().toLowerCase();

  return records
    .filter(
      (record) =>
        !filter.hiddenClasses.has(statusClass(record.status)) &&
        (filter.method === '' || record.method === filter.method) &&
        (!filter.serverId || record.serverId === filter.serverId) &&
        (text === '' || searchable(record).includes(text)),
    )
    .reverse();
};

export const countByClass = (records: DevtoolsRequestRecord[]): Map<string, number> => {
  const counts = new Map<string, number>(MAIN_STATUS_CLASSES.map((name) => [name, 0]));

  for (const record of records)
    counts.set(statusClass(record.status), (counts.get(statusClass(record.status)) ?? 0) + 1);

  return counts;
};

/** HTTP methods first, then the dispatch kinds, each in the order they first appeared. */
export const methodsOf = (records: DevtoolsRequestRecord[]): string[] => {
  const methods = [...new Set(records.map((record) => record.method))];

  return [
    ...methods.filter((method) => !method.startsWith('@')),
    ...methods.filter((method) => method.startsWith('@')),
  ];
};

export const isAnswer = (step: DevtoolsRequestStep, record: Pick<DevtoolsRequestRecord, 'answeredBy'>): boolean =>
  step.kind === record.answeredBy.kind && step.name === record.answeredBy.name;

/** The run that was current when the request started: records carry no generation of their own. */
export const runOfRecord = (record: DevtoolsRequestRecord, runs: ConsoleRun[]): number | null => {
  let gen: number | null = null;

  for (const run of runs) {
    if (run.startedAt <= record.startedAt) gen = run.gen;
  }

  return gen;
};

const trimSlash = (path: string): string => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path);

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const matchSegments = (pattern: string[], target: string[]): Record<string, string> | null => {
  const params: Record<string, string> = {};

  for (let i = 0; i < pattern.length; i++) {
    const segment = pattern[i] ?? '';
    const value = target[i];

    if (segment === WILDCARD) {
      params[WILDCARD] = target.slice(i).map(decode).join('/');

      return params;
    }

    const param = PARAM_SEGMENT.exec(segment);

    if (param?.[1]) {
      if (value === undefined || value === '') {
        if (param[2] === '?') continue;

        return null;
      }

      params[param[1]] = decode(value);
    } else if (segment !== value) {
      return null;
    }
  }

  return target.length <= pattern.length ? params : null;
};

const staticSegments = (route: DevtoolsRoute): number =>
  route.path.split('/').filter((segment) => segment !== WILDCARD && !PARAM_SEGMENT.test(segment)).length;

export interface RouteMatch {
  route: DevtoolsRoute;
  /** Decoded, by parameter name; the wildcard is `*`. */
  params: Record<string, string>;
}

/** The route that serves `method path`: the one with the most literal segments, a route of the exact method over `ALL`. */
export const matchRoute = (routes: DevtoolsRoute[], method: string, path: string): RouteMatch | null => {
  const target = trimSlash(path).split('/');
  let best: (RouteMatch & { score: number }) | null = null;

  for (const route of routes) {
    if (route.httpMethod !== method && route.httpMethod !== 'ALL') continue;

    const params = matchSegments(trimSlash(route.path).split('/'), target);

    if (!params) continue;

    const score = staticSegments(route) * 2 + (route.httpMethod === method ? 1 : 0);

    if (!best || score > best.score) best = { route, params, score };
  }

  return best ? { route: best.route, params: best.params } : null;
};

/** What the Endpoints panel opens on: a route, and for a replay the path values and method of the request. */
export interface EndpointFocus {
  key: string;
  params?: Record<string, string>;
  method?: string;
}

/** `null` for a dispatch record, or a path no route of the app serves. */
export const replayFocus = (record: DevtoolsRequestRecord, routes: DevtoolsRoute[]): EndpointFocus | null => {
  if (isDispatch(record)) return null;

  const match = matchRoute(routes, record.method, record.path);

  return match ? { key: routeKey(match.route), params: match.params, method: record.method } : null;
};

/** Allowance for the app and the browser reading the same clock at slightly different moments. */
const CLOCK_SLACK_MS = 50;

/** The newest record of `method path` that started while the console was waiting for its response. */
export const recordForResponse = (
  records: DevtoolsRequestRecord[],
  request: { method: string; path: string },
  sentAt: number,
  receivedAt: number,
): DevtoolsRequestRecord | null => {
  const path = trimSlash(request.path);
  const method = request.method.toUpperCase();

  return (
    records.findLast(
      (record) =>
        record.method === method &&
        trimSlash(record.path) === path &&
        record.startedAt >= sentAt - CLOCK_SLACK_MS &&
        record.startedAt <= receivedAt + CLOCK_SLACK_MS,
    ) ?? null
  );
};
