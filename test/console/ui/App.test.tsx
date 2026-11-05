import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleBrowserMessage, ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import { App, Shell } from '../../../console-ui/App';
import { viewCount } from '../../../console-ui/shell/Sidebar';
import { appStatus, childLabel, runStatus } from '../../../console-ui/shell/status';
import { VIEWS, viewFromHash } from '../../../console-ui/shell/views';
import { consoleReducer, type ConsoleState, initialConsoleState } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const running: ConsoleState = consoleReducer(
  { ...initialConsoleState, connection: 'open' },
  { kind: 'message', message: recording[0]! },
);
const child = (message: Extract<ConsoleHostMessage, { type: 'child' }>) =>
  consoleReducer(running, { kind: 'message', message });

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
    const snapshot = running.snapshot!;

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
      <Shell state={{ ...running, hello: null }} token="t" initialView="messaging" send={send} />,
    );

    expect(live).toContain('<h1>Messaging</h1>');
    expect(live).toContain('NightlyCleanup');
    expect(live).toMatch(/<button type="button" class="icon-btn">.*Run now<\/button>/);
    expect(silent).toContain('Not connected to the console host');
    expect(silent).not.toMatch(/<button type="button" class="icon-btn">/);
    expect(starting).toContain('The app has not started yet');
  });

  test.each(['config', 'exceptions'] as const)('%s routes to a placeholder for now', (view) => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView={view} />);

    expect(html).toContain('This panel is not built yet.');
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
      runStatus({ ...running, metrics: [{ ...sample, readiness }] });

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
