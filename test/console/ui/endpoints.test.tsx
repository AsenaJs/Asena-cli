import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { type ConsoleHttpRequest, isConsoleHttpRequest } from '../../../lib/console/hostProtocol';
import type { DevtoolsHello, DevtoolsRoute, DevtoolsSnapshot } from '../../../lib/console/protocol';
import {
  EndpointsPanel,
  groupByController,
  NoSelection,
  reconcileSelection,
} from '../../../console-ui/endpoints/EndpointsPanel';
import {
  addToHistory,
  HISTORY_BODY_LIMIT,
  HISTORY_KEY,
  HISTORY_LIMIT,
  type HistoryEntry,
  loadHistory,
  saveHistory,
} from '../../../console-ui/endpoints/history';
import { type FetchLike, sendHttp } from '../../../console-ui/endpoints/http';
import {
  buildRequest,
  draftFor,
  fillPath,
  jsonProblem,
  pathParams,
  prettyBody,
  reconcileDraft,
  repeatedKeys,
  requestUrl,
} from '../../../console-ui/endpoints/requestBuilder';
import { highlightJson } from '../../../console-ui/endpoints/highlight';
import { ChainView, ResponseView, RouteTester } from '../../../console-ui/endpoints/RouteTester';
import {
  describeIncoming,
  encodeOutgoing,
  WebSocketTester,
  wsAppUrl,
} from '../../../console-ui/endpoints/WebSocketTester';
import type { StorageLike } from '../../../console-ui/state/storage';
import snapshotJson from '../fixtures/snapshot.json';

const snapshot = snapshotJson as unknown as DevtoolsSnapshot;
const hello: DevtoolsHello = { coreVersion: '0.13.0', adapter: 'Ergenecore', port: 3000, pid: 1 };
const routeAt = (method: string, path: string): DevtoolsRoute =>
  snapshot.routes.find((route) => route.httpMethod === method && route.path === path)!;
const create = routeAt('POST', '/items/');
const find = routeAt('GET', '/items/:id');
const rename = routeAt('PUT', '/items/:id/name');
const images = routeAt('GET', '/items/images/*');

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError');

    this.items.set(key, value);
  }
}

const entry = (at: number, body = '{}'): HistoryEntry => ({
  at,
  draft: draftFor(find),
  request: { method: 'GET', path: '/items/1', query: {}, headers: {}, body: '' },
  outcome: { ok: true, response: { status: 200, headers: {}, body, durationMs: 1 } },
});

describe('path parameters', () => {
  test('come from the :segments of the route path, and * is an optional wildcard', () => {
    expect(pathParams(find.path)).toEqual([{ name: 'id', optional: false, wildcard: false }]);
    expect(pathParams(images.path)).toEqual([{ name: '*', optional: true, wildcard: true }]);
    expect(pathParams('/a/:year{[0-9]+}/:slug?')).toEqual([
      { name: 'year', optional: false, wildcard: false },
      { name: 'slug', optional: true, wildcard: false },
    ]);
    expect(pathParams(create.path)).toEqual([]);
  });

  test('are percent-encoded when filled in, so a value cannot add a segment or a query', () => {
    expect(fillPath(rename.path, { id: 'a b/../c?x=1' })).toEqual({
      path: '/items/a%20b%2F..%2Fc%3Fx%3D1/name',
      missing: [],
    });
  });

  test('the wildcard keeps its slashes and encodes each segment', () => {
    expect(fillPath(images.path, { '*': 'red lamp/front.png' }).path).toBe('/items/images/red%20lamp/front.png');
    expect(fillPath(images.path, {}).path).toBe('/items/images/');
  });

  test('a missing required parameter is reported; an empty optional one drops its segment', () => {
    expect(fillPath(rename.path, { id: '' })).toEqual({ path: '/items/:id/name', missing: ['id'] });
    expect(fillPath('/a/:slug?', {}).path).toBe('/a');
  });
});

describe('buildRequest', () => {
  test('a route with a body schema starts with an empty JSON body; one without starts empty', () => {
    expect(draftFor(create).body).toBe('{}');
    expect(draftFor(rename).body).toBe('{}');
    expect(draftFor(find).body).toBe('');
    expect(draftFor(find).params).toEqual({ id: '' });
  });

  test('builds what POST /api/http accepts, with a JSON content type for a body', () => {
    const built = buildRequest(create, { ...draftFor(create), body: '{"name":"lamp"}' });

    expect(built).toEqual({
      ok: true,
      request: {
        method: 'POST',
        path: '/items/',
        query: {},
        headers: { 'content-type': 'application/json' },
        body: '{"name":"lamp"}',
      },
    });
    expect(built.ok && isConsoleHttpRequest(built.request)).toBe(true);
  });

  test('keeps a content type the developer set, in any case', () => {
    const built = buildRequest(create, {
      ...draftFor(create),
      headers: [{ key: 'Content-Type', value: 'text/plain' }],
      body: 'x',
    });

    expect(built.ok && built.request.headers).toEqual({ 'Content-Type': 'text/plain' });
  });

  test('drops blank query and header names, trims names and keeps values as typed', () => {
    const built = buildRequest(find, {
      ...draftFor(find),
      params: { id: '7' },
      query: [
        { key: ' q ', value: 'red lamp & co' },
        { key: '', value: 'ignored' },
      ],
      headers: [{ key: 'x-trace', value: ' a ' }],
    });

    expect(built.ok && built.request).toEqual({
      method: 'GET',
      path: '/items/7',
      query: { q: 'red lamp & co' },
      headers: { 'x-trace': ' a ' },
      body: '',
    });
  });

  test('an unticked query or header row stays in the form and is not sent', () => {
    const rows = [
      { key: 'q', value: 'lamp', enabled: false },
      { key: 'q', value: 'desk' },
    ];
    const built = buildRequest(find, { ...draftFor(find), params: { id: '7' }, query: rows, headers: rows });

    expect(built.ok && built.request.query).toEqual({ q: 'desk' });
    expect(built.ok && built.request.headers).toEqual({ q: 'desk' });
    expect(repeatedKeys(rows)).toEqual([]);
  });

  test('a GET or HEAD sends no body even when the draft has one', () => {
    const built = buildRequest(find, { ...draftFor(find), params: { id: '1' }, body: '{"x":1}' });

    expect(built.ok && built.request.body).toBe('');
    expect(built.ok && built.request.headers).toEqual({});
  });

  test('refuses to build while a required path parameter is empty', () => {
    expect(buildRequest(rename, draftFor(rename))).toEqual({ ok: false, missing: ['id'] });
  });

  test('an ALL route sends the method the developer picked', () => {
    const all: DevtoolsRoute = { ...find, httpMethod: 'ALL' };
    const built = buildRequest(all, { ...draftFor(all), method: 'DELETE', params: { id: '1' } });

    expect(draftFor(all).method).toBe('GET');
    expect(built.ok && built.request.method).toBe('DELETE');
  });
});

describe('query encoding and display helpers', () => {
  test('the displayed URL encodes the query the way a form does', () => {
    expect(requestUrl({ path: '/items/7', query: { q: 'red lamp & co', 'a/b': 'é' } })).toBe(
      '/items/7?q=red+lamp+%26+co&a%2Fb=%C3%A9',
    );
    expect(requestUrl({ path: '/items/', query: {} })).toBe('/items/');
  });

  test('repeated keys are reported, since only the last value travels', () => {
    expect(
      repeatedKeys([
        { key: 'tag', value: 'a' },
        { key: ' tag', value: 'b' },
        { key: 'x', value: '1' },
      ]),
    ).toEqual(['tag']);
  });

  test('JSON problems and pretty bodies', () => {
    expect(jsonProblem('')).toBeNull();
    expect(jsonProblem('{"a":1}')).toBeNull();
    expect(jsonProblem('{a:1}')).not.toBeNull();
    expect(prettyBody('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(prettyBody('<p>hi</p>')).toBe('<p>hi</p>');
  });
});

describe('sendHttp', () => {
  const request: ConsoleHttpRequest = { method: 'GET', path: '/items/1', query: {}, headers: {}, body: '' };
  const answering =
    (status: number, body: string, calls: { url: string; body: string }[] = []): FetchLike =>
    async (url, init) => {
      calls.push({ url, body: init.body });

      return { ok: status >= 200 && status < 300, status, text: async () => body };
    };

  test('posts the request to the host proxy with the token and returns its answer', async () => {
    const calls: { url: string; body: string }[] = [];
    const response = { status: 200, headers: { 'content-type': 'application/json' }, body: '{}', durationMs: 2 };
    const outcome = await sendHttp(request, 'a+b', answering(200, JSON.stringify(response), calls));

    expect(calls).toEqual([{ url: '/api/http?t=a%2Bb', body: JSON.stringify(request) }]);
    expect(outcome).toEqual({ ok: true, response });
  });

  test('reports the 502 reason when no child is running', async () => {
    expect(await sendHttp(request, 't', answering(502, '{"reason":"the app is not running"}'))).toEqual({
      ok: false,
      reason: 'The console host answered 502: the app is not running',
    });
  });

  test('reports a refused token, an unreachable host and a malformed answer', async () => {
    expect(await sendHttp(request, 't', answering(403, 'Forbidden'))).toEqual({
      ok: false,
      reason: 'The console host answered 403',
    });
    expect(
      await sendHttp(request, 't', async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).toEqual({ ok: false, reason: 'Could not reach the console host: Failed to fetch' });
    expect((await sendHttp(request, 't', answering(200, '{"status":"x"}'))).ok).toBe(false);
  });
});

describe('request history', () => {
  test('keeps the newest entries first, at most the limit per route', () => {
    let history = {};

    for (let i = 0; i < HISTORY_LIMIT + 3; i++) history = addToHistory(history, 'GET /items/:id', entry(i));

    const kept = (history as Record<string, HistoryEntry[]>)['GET /items/:id']!;

    expect(kept).toHaveLength(HISTORY_LIMIT);
    expect(kept[0]?.at).toBe(HISTORY_LIMIT + 2);
  });

  test('cuts a long response body and marks the entry', () => {
    const history = addToHistory({}, 'k', entry(1, 'x'.repeat(HISTORY_BODY_LIMIT + 10)));
    const stored = history['k']![0]!;

    expect(stored.truncated).toBe(true);
    expect(stored.outcome.ok && stored.outcome.response.body.length).toBe(HISTORY_BODY_LIMIT);
  });

  test('round-trips through storage', () => {
    const storage = new MemoryStorage();
    const history = addToHistory({}, 'GET /items/:id', entry(5));

    expect(saveHistory(storage, history)).toBe(true);
    expect(loadHistory(storage)).toEqual(history);
  });

  test('survives storage that throws, holds garbage or is missing', () => {
    const failing = new MemoryStorage();

    failing.failWrites = true;
    expect(saveHistory(failing, { k: [entry(1)] })).toBe(false);
    expect(saveHistory(null, { k: [entry(1)] })).toBe(false);

    const throwing: StorageLike = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {},
    };

    expect(loadHistory(throwing)).toEqual({});
    expect(loadHistory(null)).toEqual({});

    const garbage = new MemoryStorage();

    garbage.items.set(HISTORY_KEY, '{not json');
    expect(loadHistory(garbage)).toEqual({});
    garbage.items.set(HISTORY_KEY, JSON.stringify({ k: [{ at: 'x' }, entry(2)], other: 'nope' }));
    expect(loadHistory(garbage)).toEqual({ k: [entry(2)] });
  });
});

describe('WebSocket tester helpers', () => {
  test('connects to the app port on 127.0.0.1 at the namespace path', () => {
    expect(wsAppUrl(3000, 'ws/items')).toBe('ws://127.0.0.1:3000/ws/items');
    expect(wsAppUrl(3000, '/chat')).toBe('ws://127.0.0.1:3000/chat');
  });

  test('sends text as typed and JSON compacted, refusing JSON that does not parse', () => {
    expect(encodeOutgoing(' hi ', 'text')).toEqual({ ok: true, data: ' hi ' });
    expect(encodeOutgoing('{ "a": 1 }', 'json')).toEqual({ ok: true, data: '{"a":1}' });
    expect(encodeOutgoing('{a}', 'json').ok).toBe(false);
  });

  test('describes binary frames by size', () => {
    expect(describeIncoming('hello')).toBe('hello');
    expect(describeIncoming(new ArrayBuffer(4))).toBe('[binary, 4 bytes]');
    expect(describeIncoming(new Blob(['abc']))).toBe('[binary, 3 bytes]');
  });
});

describe('reconcileDraft', () => {
  const base = { method: 'GET', params: { id: '', tag: 'old' }, query: [], headers: [], body: '{}' };
  const next = { method: 'POST', params: { id: '', slug: 'new' }, query: [], headers: [], body: '' };

  test('keeps what the user edited, whatever the new route prefills', () => {
    const edited = {
      method: 'PUT',
      params: { id: '7', tag: 'old' },
      query: [{ key: 'page', value: '2' }],
      headers: [{ key: 'x-probe', value: '1', enabled: false }],
      body: '{"a":1}',
    };

    expect(reconcileDraft(edited, base, { ...next, params: { id: 'other', tag: 'new' } })).toEqual({
      ...edited,
      params: { id: '7', tag: 'new' },
    });
  });

  test('drops the params the route no longer has, edited or not', () => {
    const draft = { ...base, params: { id: '', tag: 'edited' } };

    expect(Object.keys(reconcileDraft(draft, base, next).params)).toEqual(['id', 'slug']);
  });

  test('refreshes the prefills the user left alone', () => {
    expect(reconcileDraft(base, base, next)).toEqual(next);
  });

  test('a param the new route adds starts from its prefill', () => {
    const added = { ...next, params: { id: '', slug: '', extra: 'x' } };

    expect(reconcileDraft({ ...base, params: { id: '7', tag: 'old' } }, base, added).params).toEqual({
      id: '7',
      slug: '',
      extra: 'x',
    });
  });

  test('a body schema appearing fills an untouched body, and a typed one stays when it goes', () => {
    const noSchema = draftFor({ ...create, hasBodySchema: false });
    const withSchema = draftFor({ ...create, hasBodySchema: true });

    expect(reconcileDraft(noSchema, noSchema, withSchema).body).toBe('{}');
    expect(reconcileDraft({ ...withSchema, body: '{"a":1}' }, withSchema, noSchema).body).toBe('{"a":1}');
    expect(reconcileDraft(withSchema, withSchema, noSchema).body).toBe('');
  });
});

describe('endpoints panel rendering', () => {
  const panel = (props: Partial<Parameters<typeof EndpointsPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <EndpointsPanel
        snapshot={snapshot}
        hello={hello}
        token="t"
        focus={null}
        storage={new MemoryStorage()}
        {...props}
      />,
    );

  test('a route shows its whole path, wrapping at the slashes', () => {
    const html = panel();

    expect(html).toContain('<span class="route-path" title="/items/:id/name">/items<wbr/>/:id<wbr/>/name</span>');
  });

  test('a long route list scrolls in its own card, so a picked route keeps its tester in view', () => {
    const css = readFileSync(join(import.meta.dir, '../../../console-ui/styles/endpoints.css'), 'utf-8');
    const block = (selector: string) => css.match(new RegExp(`^${selector} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

    expect(block('\\.ep-layout')).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(block('\\.routes')).toContain('overflow: auto');
    expect(block('\\.routes')).toContain('max-height: 100%');
    expect(block('\\.req')).toContain('overflow: auto');
    expect(block('\\.req')).toContain('max-height: 100%');
  });

  describe('after a restart changes the routes', () => {
    const http = { kind: 'http', key: 'PUT /items/:id/name' } as const;
    const socket = { kind: 'ws', namespace: snapshot.websockets[0]!.namespace } as const;
    const renamedValidator: DevtoolsSnapshot = {
      ...snapshot,
      routes: snapshot.routes.map((route) => (route === rename ? { ...route, validator: 'NewValidator' } : route)),
    };
    const withoutRename: DevtoolsSnapshot = {
      ...snapshot,
      routes: snapshot.routes.filter((route) => route !== rename),
      websockets: [],
    };

    test('keeps the route selected by method and path, and drops one that is gone', () => {
      expect(reconcileSelection(http, renamedValidator)).toEqual(http);
      expect(reconcileSelection(socket, renamedValidator)).toEqual(socket);
      expect(reconcileSelection(http, withoutRename)).toBeNull();
      expect(reconcileSelection(socket, withoutRename)).toBeNull();
      expect(reconcileSelection(null, snapshot)).toBeNull();
    });

    test('a selection that is gone shows what was open and that its history is kept', () => {
      const html = renderToStaticMarkup(<NoSelection gone="PUT /items/:id/name" />);

      expect(html).toContain('PUT /items/:id/name is gone after the restart');
      expect(html).toContain('history');
      expect(renderToStaticMarkup(<NoSelection gone={null} />)).toContain('Pick an endpoint');
    });
  });

  test('groups the routes by controller', () => {
    expect(groupByController(snapshot.routes).map(([controller, routes]) => [controller, routes.length])).toEqual([
      ['ItemController', 4],
    ]);
  });

  test('lists every route and socket in one list, opens the first route and offers to send it', () => {
    const html = panel();

    for (const route of snapshot.routes) expect(html).toContain(route.path);

    expect(html).toContain('<span>ItemController</span><span>4</span>');
    expect(html).toContain('<span>WebSockets</span><span>1</span>');
    expect(html).toContain('/ws/items');
    expect(html).toContain('ItemController.create');
    expect(html).toContain('validator CreateItemValidator');
    expect(html).toContain('<span class="host">http://127.0.0.1:3000</span>');
    expect(html).toMatch(/<textarea[^>]*>\{\}<\/textarea>/);
    expect(html).toMatch(/<button type="button" class="send">/);
    expect(html).toContain('Send the request to see the response.');
    expect(html).toContain('Handled by');
  });

  test('opens the route the graph linked to, with its path parameter marked in the URL', () => {
    const html = panel({ focus: { key: 'PUT /items/:id/name' } });

    expect(html).toContain('ItemController.rename');
    expect(html).toContain('contract RenameItemContext');
    expect(html).toContain('Fill in :id');
    expect(html).toContain('<span class="param" title=":id">:id</span>');
    expect(html).toMatch(/aria-selected="true"[^>]*>Body</);
  });

  test('a replayed request opens its route with the path values it was sent with', () => {
    const html = panel({ focus: { key: 'GET /items/images/*', params: { '*': 'lamp front.png' }, method: 'GET' } });

    expect(html).toContain('ItemController.images');
    expect(html).toContain('<span class="param" title=":*">lamp front.png</span>');
    expect(html).not.toContain('Fill in');
    expect(html).toContain('send the request to see the chain that answers it');
  });

  test('says why it cannot send without a running app or a token', () => {
    expect(panel({ hello: null })).toContain('Waiting for the app to start');
    expect(panel({ token: null })).toContain('No session token');
    expect(panel({ hello: { ...hello, adapter: null, port: null } })).toContain('runs headless');
    expect(panel({ hello: null })).toMatch(/<button type="button" class="send" disabled/);
  });

  test('shows the stored history of the route', () => {
    const storage = new MemoryStorage();

    saveHistory(
      storage,
      addToHistory({}, 'POST /items/', { ...entry(1), request: { ...entry(1).request, path: '/items/' } }),
    );

    const html = panel({ storage });

    expect(html).toContain('History');
    expect(html).toContain('Clear history');
  });

  test('a GET route opens on its path parameters, with no body to edit', () => {
    const html = renderToStaticMarkup(
      <RouteTester
        route={find}
        history={[]}
        send={null}
        blockedReason={null}
        onRecord={() => {}}
        onClearHistory={() => {}}
      />,
    );

    expect(html).toMatch(/aria-selected="true"[^>]*>Params<span class="badge">1<\/span>/);
    expect(html).toContain('from the route path');
    expect(html).not.toContain('<textarea');
  });

  test('a response shows the status pill, time, size, run, and the body highlighted', () => {
    const html = renderToStaticMarkup(
      <ResponseView
        outcome={{
          ok: true,
          response: { status: 409, headers: { 'x-app': 'items' }, body: '{"error":"taken","n":2}', durationMs: 2.25 },
        }}
        gen={3}
      />,
    );

    expect(html).toContain('<span class="pill warn">');
    expect(html).toContain('409 Conflict');
    expect(html).toContain('2.3 ms');
    expect(html).toContain('<b>23 B</b>');
    expect(html).toContain('Run 3');
    expect(html).toContain('Headers<span class="badge">1</span>');
    expect(html).toContain('<span class="k">&quot;error&quot;</span>: <span class="s">&quot;taken&quot;</span>');
    expect(html).toContain('<span class="n">2</span>');
    expect(renderToStaticMarkup(<ResponseView outcome={{ ok: false, reason: 'down' }} />)).toContain('role="alert"');
    expect(renderToStaticMarkup(<ResponseView outcome={null} />)).toContain('Send the request');
  });

  test('a body that is not JSON is shown as it came', () => {
    expect(highlightJson('plain <text>')).toEqual(['plain <text>']);
  });

  test('the chain area says why it has no chain, and marks the step that answered', () => {
    expect(renderToStaticMarkup(<ChainView chain={null} empty="nothing yet" />)).toContain('nothing yet');

    const steps = [
      { kind: 'middleware' as const, name: 'AuditTrail' },
      { kind: 'controller' as const, name: 'ItemController.find' },
      { kind: 'catch' as const, name: 'ApiExceptionHandler.known' },
    ];
    const caught = renderToStaticMarkup(<ChainView chain={{ steps, answeredBy: steps[2]! }} empty="" />);
    const handled = renderToStaticMarkup(
      <ChainView chain={{ steps: steps.slice(0, 2), answeredBy: steps[1]! }} empty="" />,
    );

    expect(caught).toContain('<span class="step " title="Middleware">AuditTrail</span>');
    expect(caught).toContain('<span class="step win" title="@Catch">ApiExceptionHandler.known</span>');
    expect(handled).toContain('<span class="step ok" title="Handler">ItemController.find</span>');
  });

  test('the fields that take code, names and ids are not spell-checked', () => {
    const socket = renderToStaticMarkup(<WebSocketTester namespace="ws/items" component="ItemFeed" port={3000} />);
    const body = renderToStaticMarkup(
      <RouteTester
        route={rename}
        history={[]}
        send={null}
        blockedReason={null}
        onRecord={() => {}}
        onClearHistory={() => {}}
      />,
    );
    const params = renderToStaticMarkup(
      <RouteTester
        route={find}
        history={[]}
        send={null}
        blockedReason={null}
        onRecord={() => {}}
        onClearHistory={() => {}}
      />,
    );

    expect(socket).toMatch(/<textarea[^>]*spellCheck="false"/);
    expect(body).toMatch(/<textarea[^>]*spellCheck="false"/);
    expect(params).toMatch(/<input[^>]*aria-label="Path parameter id"[^>]*spellCheck="false"/);
  });

  test('the WebSocket tester targets the app port, or says there is none', () => {
    const ready = renderToStaticMarkup(<WebSocketTester namespace="ws/items" component="ItemFeed" port={3000} />);
    const headless = renderToStaticMarkup(<WebSocketTester namespace="ws/items" component="ItemFeed" port={null} />);

    expect(ready).toContain('<span class="host">ws://127.0.0.1:3000</span>/ws/items');
    expect(ready).toContain('ItemFeed');
    expect(headless).toContain('The app has no HTTP port yet');
    expect(headless).toMatch(/<button type="button" class="send" disabled/);
  });
});
