import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import type { DevtoolsRequestRecord, DevtoolsRoute } from '../../../lib/console/protocol';
import {
  countByClass,
  filterRequests,
  LOG_STAMP_SLACK_MS,
  logsDuring,
  matchRoute,
  methodsOf,
  recordForResponse,
  replayFocus,
  type RequestFilter,
  runOfRecord,
} from '../../../console-ui/requests/records';
import { RequestsPanel } from '../../../console-ui/requests/RequestsPanel';
import { consoleReducer, type ConsoleState, initialConsoleState } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const state: ConsoleState = recording.reduce(
  (current, message) => consoleReducer(current, { kind: 'message', message }),
  initialConsoleState,
);
const routes = state.snapshot!.routes;
const record = (id: string): DevtoolsRequestRecord => state.requests.find((candidate) => candidate.id === id)!;
const all: RequestFilter = { hiddenClasses: new Set(), method: '', text: '' };
const ids = (records: DevtoolsRequestRecord[]) => records.map((candidate) => candidate.id);

describe('request records', () => {
  test('lists every record newest first, and filters by status class, method and text', () => {
    expect(ids(filterRequests(state.requests, all))).toEqual(ids(state.requests).reverse());
    expect(ids(filterRequests(state.requests, { ...all, hiddenClasses: new Set(['2xx', '4xx']) }))).toEqual(['r-5']);
    expect(ids(filterRequests(state.requests, { ...all, method: 'PUT' }))).toEqual(['r-4']);
    expect(ids(filterRequests(state.requests, { ...all, text: 'apiexceptionhandler.KNOWN' }))).toEqual(['r-2']);
    expect(ids(filterRequests(state.requests, { ...all, text: 'audittrail', method: 'GET' }))).toEqual([
      'r-9',
      'r-8',
      'r-5',
      'r-2',
    ]);
  });

  test('counts the four main status classes even when empty, and methods list HTTP before dispatches', () => {
    expect([...countByClass(state.requests)]).toEqual([
      ['2xx', 4],
      ['3xx', 0],
      ['4xx', 6],
      ['5xx', 1],
    ]);
    expect([...countByClass([{ ...record('r-1'), status: 101 }])]).toContainEqual(['1xx', 1]);
    expect(methodsOf(state.requests)).toEqual(['POST', 'GET', 'PUT', '@Schedule', '@On', '@MessagePattern']);
  });

  test('a record belongs to the run that was current when it started', () => {
    expect(runOfRecord(record('r-6'), state.runs)).toBe(1);
    expect(runOfRecord(record('r-7'), state.runs)).toBe(3);
    expect(runOfRecord(record('r-7'), [])).toBeNull();
  });

  test('attaches the lines its run wrote between its start and its end', () => {
    const lines = (id: string) => logsDuring(record(id), state.logs, state.runs).map((entry) => entry.line);

    expect(lines('r-1')).toEqual(['Item 1 created']);
    expect(lines('r-4')).toEqual(['Rename of item 7 rejected: name taken']);
    expect(lines('r-5')).toEqual(["TypeError: undefined is not an object (evaluating 'item.name')"]);
    expect(lines('r-6')).toEqual(['NightlyCleanup removed 3 drafts']);
    expect(lines('r-10')).toEqual(['Item 12 created, notifying listeners']);
    expect(lines('r-3')).toEqual([]);
  });

  test('a line stamped just after the end still counts, a later one or one from another run does not', () => {
    const request = { ...record('r-7'), startedAt: 1000, durationMs: 10 };
    const runs = [
      { gen: 1, startedAt: 0, cause: { kind: 'start' as const }, state: 'exited' as const },
      { gen: 2, startedAt: 500, cause: { kind: 'restart' as const }, state: 'running' as const },
    ];
    const line = (seq: number, gen: number, at: number) => ({
      seq,
      gen,
      stream: 'stdout' as const,
      line: `line ${seq}`,
      at,
    });
    const logs = [
      line(0, 2, 999),
      line(1, 2, 1000),
      line(2, 2, 1010 + LOG_STAMP_SLACK_MS),
      line(3, 2, 1011 + LOG_STAMP_SLACK_MS),
      line(4, 1, 1005),
    ];

    expect(logsDuring(request, logs, runs).map((entry) => entry.seq)).toEqual([1, 2]);
  });
});

describe('matching a request to its route', () => {
  test('finds the route and decodes the path values, the wildcard keeping its slashes', () => {
    expect(matchRoute(routes, 'GET', '/items/42')).toMatchObject({ route: { method: 'find' }, params: { id: '42' } });
    expect(matchRoute(routes, 'PUT', '/items/7/name')).toMatchObject({ route: { method: 'rename' } });
    expect(matchRoute(routes, 'GET', '/items/images/2026/lamp%20front.png')).toMatchObject({
      route: { method: 'images' },
      params: { '*': '2026/lamp front.png' },
    });
    expect(matchRoute(routes, 'POST', '/items/')?.route.method).toBe('create');
    expect(matchRoute(routes, 'POST', '/items')?.route.method).toBe('create');
  });

  test('a path or method no route serves matches nothing', () => {
    expect(matchRoute(routes, 'GET', '/itemz')).toBeNull();
    expect(matchRoute(routes, 'DELETE', '/items/7')).toBeNull();
    expect(matchRoute(routes, 'GET', '/items/7/name/extra')).toBeNull();
  });

  test('prefers literal segments over params, the exact method over ALL, and skips a missing optional param', () => {
    const route = (httpMethod: DevtoolsRoute['httpMethod'], path: string, method: string): DevtoolsRoute => ({
      controller: 'C',
      method,
      httpMethod,
      path,
      middlewares: [],
      validator: null,
      contract: null,
      hasBodySchema: false,
    });
    const table = [
      route('GET', '/files/:name', 'byName'),
      route('GET', '/files/latest', 'latest'),
      route('ALL', '/any/:id', 'any'),
      route('POST', '/any/:id', 'post'),
      route('GET', '/page/:n{[0-9]+}?', 'page'),
    ];

    expect(matchRoute(table, 'GET', '/files/latest')?.route.method).toBe('latest');
    expect(matchRoute(table, 'GET', '/files/report')?.route.method).toBe('byName');
    expect(matchRoute(table, 'POST', '/any/1')?.route.method).toBe('post');
    expect(matchRoute(table, 'PATCH', '/any/1')?.route.method).toBe('any');
    expect(matchRoute(table, 'GET', '/page')).toMatchObject({ route: { method: 'page' }, params: {} });
    expect(matchRoute(table, 'GET', '/page/2')).toMatchObject({ params: { n: '2' } });
  });

  test('a replay opens the matched route with the path values; dispatches and unmatched paths have none', () => {
    expect(replayFocus(record('r-9'), routes)).toEqual({
      key: 'GET /items/images/*',
      params: { '*': 'lamp front.png' },
      method: 'GET',
    });
    expect(replayFocus(record('r-4'), routes)).toEqual({
      key: 'PUT /items/:id/name',
      params: { id: '7' },
      method: 'PUT',
    });
    expect(replayFocus(record('r-3'), routes)).toBeNull();
    expect(replayFocus(record('r-10'), routes)).toBeNull();
  });

  test('the record of a sent request is the newest one of the same method and path inside the send window', () => {
    const at = (id: string, startedAt: number): DevtoolsRequestRecord => ({ ...record('r-2'), id, startedAt });
    const records = [at('old', 100), at('first', 1000), at('second', 1200), { ...at('other', 1100), path: '/items/9' }];

    expect(recordForResponse(records, { method: 'get', path: '/items/42' }, 990, 1300)?.id).toBe('second');
    expect(recordForResponse(records, { method: 'GET', path: '/items/42' }, 990, 1100)?.id).toBe('first');
    expect(recordForResponse(records, { method: 'POST', path: '/items/42' }, 990, 1300)).toBeNull();
    expect(recordForResponse(records, { method: 'GET', path: '/items/42' }, 2000, 2100)).toBeNull();
  });
});

describe('requests panel rendering', () => {
  const panel = (props: Partial<Parameters<typeof RequestsPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <RequestsPanel
        requests={state.requests}
        logs={state.logs}
        runs={state.runs}
        routes={routes}
        onReplay={() => {}}
        {...props}
      />,
    );

  test('says what appears here before the first request', () => {
    const html = panel({ requests: [] });

    expect(html).toContain('No requests yet');
    expect(html).not.toContain('<table');
  });

  test('a row per record, newest first, with status, duration and what answered', () => {
    const html = panel();
    const rows = html.match(/<tr tabindex="0"/g) ?? [];

    expect(rows).toHaveLength(state.requests.length);
    expect(html.indexOf('inventory.reserve')).toBeLessThan(html.indexOf('/items/42'));
    expect(html).toContain('<td class="mono num st st-5">500</td>');
    expect(html).toContain('<span class="muted">Adapter default</span> Ergenecore');
    expect(html).toContain('<span class="muted">Not found</span> ApiExceptionHandler.missingRoute');
    expect(html).toContain('<option value="@Schedule">@Schedule</option>');
    expect(html).not.toContain('rq-drawer');
  });

  test('the details show the chain with the answer marked, the output during the request, and the replay', () => {
    const html = panel({ initialSelected: 'r-4' });

    expect(html).toContain('rq-layout open');
    expect(html).toContain('<tr tabindex="0" aria-current="true"');
    expect(html).toContain('409 Conflict');
    expect(html).toContain('Run 1');
    expect(html).toContain(
      '<span class="step-kind">Validator</span><span class="mono step-name">RenameItemContext</span>',
    );
    expect(html).toMatch(/<li class="answered">.*ApiExceptionHandler\.conflict.*answered<\/span><\/li>/);
    expect(html).toContain('Rename of item 7 rejected: name taken');
    expect(html).toContain('Replay in Endpoints');
  });

  test('a record with nothing to replay says why', () => {
    expect(panel({ initialSelected: 'r-3' })).toContain('No route of the app serves GET /itemz');
    expect(panel({ initialSelected: 'r-10' })).toContain('A @On dispatch, not an HTTP request');
    expect(panel({ initialSelected: 'r-8' })).toContain('Nothing was written while it ran');
  });
});
