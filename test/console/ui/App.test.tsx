import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import { App, Shell } from '../../../console-ui/App';
import { appLabel, childLabel, connectionLabel } from '../../../console-ui/shell/StatusBar';
import { VIEWS, viewFromHash } from '../../../console-ui/shell/views';
import { consoleReducer, type ConsoleState, initialConsoleState } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const running: ConsoleState = consoleReducer(
  { ...initialConsoleState, connection: 'open' },
  { kind: 'message', message: recording[0]! },
);

describe('console UI shell', () => {
  test('App renders the shell and says so when the page has no session token', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('<h1 class="shell-title">Asena Console</h1>');
    expect(html).toContain('No session token in the page URL');
  });

  test('links every panel and marks the current one', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="runtime" />);

    for (const view of VIEWS) expect(html).toContain(`href="#/${view.id}"`);

    expect(html).toContain('<a href="#/runtime" class="shell-nav-link" aria-current="page">Runtime</a>');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  test.each(['requests', 'messaging', 'config', 'exceptions'] as const)('%s is a placeholder for now', (view) => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView={view} />);

    expect(html).toContain('This panel is not built yet.');
  });

  test('the graph waits for a snapshot, and says so when the one it shows is from an earlier child', () => {
    const waiting = renderToStaticMarkup(<Shell state={initialConsoleState} token="t" initialView="graph" />);
    const respawned = consoleReducer(running, {
      kind: 'message',
      message: { v: 1, type: 'child', gen: 2, state: 'starting' },
    });
    const stale = renderToStaticMarkup(<Shell state={respawned} token="t" initialView="graph" />);

    expect(waiting).toContain('Waiting for the app to report its components');
    expect(stale).toContain('Showing what generation 1 reported');
    expect(stale).toContain('Component graph');
  });

  test('the status bar shows the connection, the child and the app', () => {
    const html = renderToStaticMarkup(<Shell state={running} token="t" initialView="requests" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('Connected');
    expect(html).toContain('Generation 1: Running, pid 48211');
    expect(html).toContain('Ergenecore on :3000 · core 0.13.0');
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

  test('describe the connection', () => {
    expect(connectionLabel('closed', 't')).toBe('Disconnected, reconnecting…');
    expect(connectionLabel('open', null)).toContain('No session token');
  });

  test('call a child without a port headless', () => {
    expect(appLabel({ coreVersion: '0.13.0', adapter: null, port: null, pid: 1 })).toBe('headless · core 0.13.0');
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
