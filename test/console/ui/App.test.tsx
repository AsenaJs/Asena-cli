import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleBrowserMessage, ConsoleChildStatus, ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import { App, Shell } from '../../../console-ui/App';
import { viewCount } from '../../../console-ui/shell/Sidebar';
import { appStatus, childLabel, runStatus, serverLabel, serverOptions } from '../../../console-ui/shell/status';
import { VIEWS, viewFromHash } from '../../../console-ui/shell/views';
import { consoleReducer, type ConsoleState, initialConsoleState, serverView } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';
import { sampleWith } from '../helpers';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const feed = (state: ConsoleState, ...messages: ConsoleHostMessage[]): ConsoleState =>
  messages.reduce((current, message) => consoleReducer(current, { kind: 'message', message }), state);
const running: ConsoleState = feed({ ...initialConsoleState, connection: 'open' }, recording[0]!);
const child = (message: Extract<ConsoleHostMessage, { type: 'child' }>) => feed(running, message);
const agent = (message: Extract<ConsoleHostMessage, { type: 'agent' }>['message']): ConsoleHostMessage => ({
  v: 1,
  type: 'agent',
  message,
});
const first = running.servers[0]!;
/** The recorded app with a second, headless server that declares one schedule of its own. */
const twoServers: ConsoleState = feed(
  running,
  agent({
    v: 1,
    type: 'hello',
    payload: { ...first.hello, serverId: 'server-2', adapter: null, port: null, transports: [] },
  }),
  agent({
    v: 1,
    type: 'snapshot',
    payload: {
      ...first.snapshot!,
      serverId: 'server-2',
      components: [],
      routes: [],
      websockets: [],
      schedules: [{ name: 'WorkerHeartbeat', cron: '* * * * *' }],
    },
  }),
);
const pick = (state: ConsoleState, serverId: string) => consoleReducer(state, { kind: 'serverSelected', serverId });

describe('console UI shell', () => {
  test('App renders the shell and says so when the page has no session token', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Asena <span>Console</span>');
    expect(html).toContain('No session token in the page URL');
    expect(html).toContain('role="alert"');
  });

  test('the sidebar groups the views under Inspect and Debug and marks the current one', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="runtime" />);

    for (const view of VIEWS) expect(html).toContain(`href="#/${view.id}"`);

    expect(html).toContain('aria-label="Inspect"');
    expect(html).toContain('aria-label="Debug"');
    expect(html).toMatch(/<a href="#\/runtime" aria-current="page">/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('<h1>Runtime</h1>');
  });

  test('the sidebar counts components and endpoints, and the app card shows adapter, port and core', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="graph" />);
    const snapshot = serverView(running).snapshot!;

    expect(viewCount('graph', snapshot)).toBe(snapshot.components.length);
    expect(viewCount('endpoints', snapshot)).toBe(snapshot.routes.length + snapshot.websockets.length);
    expect(viewCount('runtime', snapshot)).toBeNull();
    expect(html).toContain(`<span class="count">${snapshot.components.length}</span>`);
    expect(html).toContain('<dd>Ergenecore</dd>');
    expect(html).toContain('<dd class="mono">:3000</dd>');
    expect(html).toContain('<dd class="mono">0.13.0</dd>');
  });

  test('requests shows the request inspector', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="requests" />);

    expect(html).toContain('<h1>Requests</h1>');
    expect(html).toContain('Requests, newest first');
  });

  test('messaging lists what can be run, and enables the actions only with a sender and a running app', () => {
    const send = () => true;
    const live = renderToStaticMarkup(<Shell state={running} token="t" initialView="messaging" send={send} />);
    const silent = renderToStaticMarkup(<Shell state={running} token="t" initialView="messaging" />);
    const starting = renderToStaticMarkup(
      <Shell
        state={child({ v: 1, type: 'child', gen: 2, state: 'starting', pid: 7, unattached: true })}
        token="t"
        initialView="messaging"
        send={send}
      />,
    );

    expect(live).toContain('<h1>Messaging</h1>');
    expect(live).toContain('NightlyCleanup');
    expect(live).toMatch(/<button type="button" class="icon-btn">.*Run now<\/button>/);
    expect(silent).toContain('Not connected to the console host');
    expect(silent).not.toMatch(/<button type="button" class="icon-btn">/);
    expect(starting).toContain('The app has not started yet');
    expect(starting).not.toMatch(/<button type="button" class="icon-btn">.*Run now<\/button>/);
  });

  describe('with one server', () => {
    test('there is no server picker, no server filter and no server name anywhere', () => {
      for (const view of VIEWS) {
        const html = renderToStaticMarkup(<Shell state={running} token="t" initialView={view.id} send={() => true} />);

        expect(html).not.toContain('server-pick');
        expect(html).not.toContain('All servers');
        expect(html).not.toContain(serverLabel(first));
        expect(html).not.toContain('server-1');
      }
    });
  });

  describe('with two servers', () => {
    const shell = (state: ConsoleState, view: (typeof VIEWS)[number]['id']) =>
      renderToStaticMarkup(
        <Shell state={state} token="t" initialView={view} send={() => true} onSelectServer={() => {}} />,
      );

    test('names each by adapter and port, or by its id when it serves no HTTP', () => {
      expect(serverOptions(twoServers)).toEqual([
        { serverId: 'server-1', label: 'Ergenecore :3000' },
        { serverId: 'server-2', label: 'Headless server-2' },
      ]);
    });

    test('the sidebar offers both and shows the most recent one until another is picked', () => {
      const recent = shell(twoServers, 'messaging');
      const picked = shell(pick(twoServers, 'server-1'), 'messaging');

      expect(recent).toContain('<label class="server-pick"><span>Server</span>');
      expect(recent).toContain('<option value="server-1">Ergenecore :3000</option>');
      expect(recent).toContain('<option value="server-2" selected="">Headless server-2</option>');
      expect(recent).toContain('<dd>headless</dd>');
      expect(recent).toContain('WorkerHeartbeat');
      expect(recent).not.toContain('NightlyCleanup');
      expect(picked).toContain('<option value="server-1" selected="">Ergenecore :3000</option>');
      expect(picked).toContain('<dd>Ergenecore</dd>');
      expect(picked).toContain('NightlyCleanup');
      expect(picked).not.toContain('WorkerHeartbeat');
    });

    test('every snapshot view shows the picked server', () => {
      const count = (html: string) => /href="#\/graph"[^>]*>.*?<span class="count">(\d+)<\/span>/.exec(html)?.[1];

      expect(count(shell(twoServers, 'graph'))).toBe('0');
      expect(count(shell(pick(twoServers, 'server-1'), 'graph'))).toBe(String(first.snapshot!.components.length));
      expect(shell(twoServers, 'endpoints')).toContain('The app registers no HTTP route and no WebSocket.');
      expect(shell(pick(twoServers, 'server-1'), 'endpoints')).toContain('/items/:id/name');
      expect(shell(twoServers, 'config')).not.toContain('DEVTOOLS_FIXTURE_REGION');
      expect(shell(pick(twoServers, 'server-1'), 'config')).toContain('DEVTOOLS_FIXTURE_REGION');
    });

    test('the status pill and the health line follow the picked server', () => {
      const sample = twoServers.metrics.at(-1)!;
      const state = {
        ...twoServers,
        metrics: [sampleWith(sample, { readiness: { status: 'not_ready', state: 'STARTING' } }, 'server-2')],
      };

      expect(runStatus(state).label).toBe('Not ready');
      expect(runStatus(pick(state, 'server-1')).label).toBe('Ready');
    });

    test('the requests view lists every server and offers the filter', () => {
      const html = shell(twoServers, 'requests');

      expect(html).toContain('<option value="" selected="">All servers</option>');
      expect(html.match(/<tr tabindex="0"/g)).toHaveLength(twoServers.requests.length);
    });

    test('a stopped server stays pickable, is marked, and takes no commands', () => {
      const stopped = feed(twoServers, agent({ v: 1, type: 'serverStopped', payload: { serverId: 'server-2' } }));
      const onStopped = shell(pick(stopped, 'server-2'), 'messaging');

      expect(serverView(stopped).server?.serverId).toBe('server-1');
      expect(onStopped).toContain('<option value="server-2" selected="">Headless server-2 (stopped)</option>');
      expect(onStopped).toContain('This server has stopped. Showing what it reported');
      expect(onStopped).toContain('This server has stopped; it takes no commands.');
      expect(onStopped).not.toMatch(/<button type="button" class="icon-btn">.*Run now<\/button>/);
      expect(shell(stopped, 'messaging')).toMatch(/<button type="button" class="icon-btn">.*Run now<\/button>/);
    });

    test('after a restart the previous run is named as such until the next one reports', () => {
      const restarted = feed(twoServers, { v: 1, type: 'child', gen: 2, state: 'starting', pid: 9 });

      expect(serverOptions(restarted).map((option) => option.label)).toEqual([
        'Ergenecore :3000 (previous run)',
        'Headless server-2 (previous run)',
      ]);
      expect(shell(restarted, 'messaging')).toContain('Showing what run 1 reported');
    });
  });

  test('config shows the @Value fields of the running app', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="config" />);

    expect(html).toContain('<h1>Config</h1>');
    expect(html).toContain('DEVTOOLS_FIXTURE_REGION');
  });

  test('exceptions maps the caught types of the running app', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="exceptions" />);

    expect(html).toContain('<h1>Exceptions</h1>');
    expect(html).toContain('Who catches this?');
    expect(html).toContain('ApiExceptionHandler.conflict');
  });

  test.each(['messaging', 'config', 'exceptions'] as const)('%s waits for the snapshot', (view) => {
    const html = renderToStaticMarkup(<Shell state={initialConsoleState} token="t" initialView={view} />);

    expect(html).toContain('Waiting for the app to report its components');
    expect(html).toContain(`<h1>${VIEWS.find((entry) => entry.id === view)!.label}</h1>`);
  });

  test('the graph waits for a snapshot, and says so when the one it shows is from an earlier run', () => {
    const waiting = renderToStaticMarkup(<Shell state={initialConsoleState} token="t" initialView="graph" />);
    const stale = renderToStaticMarkup(
      <Shell state={child({ v: 1, type: 'child', gen: 2, state: 'starting' })} token="t" initialView="graph" />,
    );

    expect(waiting).toContain('Waiting for the app to report its components');
    expect(stale).toContain('Showing what run 1 reported');
    expect(stale).toContain('Find a component');
  });

  test('the status bar shows readiness, the run and pid, and the uptime', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="requests" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('Ready');
    expect(html).toContain('Run 1 · pid 48211');
    expect(html).toContain('up 5s');
  });

  test('Restart asks the host for a restart, and is off without a connection', () => {
    const sent: ConsoleBrowserMessage[] = [];
    const send = (message: ConsoleBrowserMessage) => sent.push(message) > 0;
    const connected = renderToStaticMarkup(<Shell state={running} token="t" initialView="graph" send={send} />);
    const closed = renderToStaticMarkup(
      <Shell state={{ ...running, connection: 'closed' }} token="t" initialView="graph" send={send} />,
    );

    expect(connected).toMatch(/<button type="button" class="icon-btn" title="Restart the app">/);
    expect(closed).toMatch(/<button type="button" class="icon-btn" title="Restart the app" disabled="">/);
  });
});

describe('status labels', () => {
  test('describe each child state, with the exit code or the signal', () => {
    expect(childLabel(null)).toBe('No app process yet');
    expect(childLabel({ gen: 1, state: 'starting', pid: 7 })).toBe('Starting, pid 7');
    expect(childLabel({ gen: 1, state: 'restarting' })).toBe('Restarting');
    expect(childLabel({ gen: 2, state: 'exited', code: 1 })).toBe('Exited with code 1');
    expect(childLabel({ gen: 2, state: 'exited', signal: 'SIGKILL' })).toBe('Killed by SIGKILL');
  });

  test('a kill the host sent reads as its restart or stop; any other kill still reads as a crash', () => {
    const exited = (fields: Partial<ConsoleChildStatus>) =>
      child({ v: 1, type: 'child', gen: 1, state: 'exited', ...fields });

    expect(runStatus(exited({ signal: 'SIGKILL', endedBy: 'restart' }))).toEqual({
      tone: 'warn',
      label: 'Restarting',
      detail: 'Stopped for a restart',
    });
    expect(runStatus(exited({ signal: 'SIGTERM', endedBy: 'stop' }))).toEqual({
      tone: 'neutral',
      label: 'Stopped',
      detail: 'Stopped by the console',
    });
    expect(runStatus(exited({ signal: 'SIGKILL' }))).toEqual({
      tone: 'bad',
      label: 'Crashed',
      detail: 'Killed by SIGKILL',
    });
  });

  test('an app that runs without its agent is not shown as still starting', () => {
    expect(runStatus(child({ v: 1, type: 'child', gen: 2, state: 'starting', pid: 7, unattached: true }))).toEqual({
      tone: 'warn',
      label: 'No agent',
      detail: 'Running without the devtools agent, pid 7',
    });
  });

  test('the first pill: session, connection, process, then readiness', () => {
    const label = (state: ConsoleState, token: string | null = 't') => appStatus(state, token).label;

    expect(label(running, null)).toBe('No session');
    expect(label({ ...running, connection: 'closed' })).toBe('Disconnected');
    expect(label({ ...initialConsoleState, connection: 'open' })).toBe('Connecting');
    expect(label(child({ v: 1, type: 'child', gen: 2, state: 'starting' }))).toBe('Starting');
    expect(label(child({ v: 1, type: 'child', gen: 1, state: 'restarting' }))).toBe('Restarting');
    expect(label(child({ v: 1, type: 'child', gen: 1, state: 'exited', code: 1 }))).toBe('Crashed');
    expect(label(child({ v: 1, type: 'child', gen: 1, state: 'exited', code: 0 }))).toBe('Stopped');
    expect(label(running)).toBe('Ready');
  });

  test('readiness from the latest sample decides between ready, degraded and not ready', () => {
    const sample = running.metrics.at(-1)!;
    const withReadiness = (readiness: (typeof sample)['readiness']) =>
      runStatus({ ...running, metrics: [sampleWith(sample, { readiness })] });

    expect(withReadiness({ status: 'up' }).label).toBe('Ready');
    expect(withReadiness({ status: 'degraded', transports: { default: 'disconnected' } }).label).toBe('Degraded');
    expect(withReadiness({ status: 'not_ready', state: 'STARTING' })).toMatchObject({
      label: 'Not ready',
      detail: 'Lifecycle STARTING',
    });
  });
});

describe('viewFromHash', () => {
  test('maps a panel hash to its view and anything else to the graph', () => {
    expect(viewFromHash('#/endpoints')).toBe('endpoints');
    expect(viewFromHash('#/nope')).toBe('graph');
    expect(viewFromHash('')).toBe('graph');
  });

  test('an in-page anchor such as the skip link keeps the current panel', () => {
    expect(viewFromHash('#main', 'endpoints')).toBe('endpoints');
    expect(viewFromHash('#/runtime', 'endpoints')).toBe('runtime');
  });
});
