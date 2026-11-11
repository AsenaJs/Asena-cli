import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  type ConsoleBrowserMessage,
  type ConsoleHostMessage,
  isConsoleBrowserMessage,
} from '../../../lib/console/hostProtocol';
import type { DevtoolsCommandRequest } from '../../../lib/console/protocol';
import {
  commandBlockedReason,
  commandSender,
  eventCommand,
  formatNextRun,
  groupBy,
  isPattern,
  lastDispatch,
  messageCommand,
  nextCommandId,
  parsePayload,
  resultText,
  scheduleCommand,
  transportStates,
} from '../../../console-ui/messaging/commands';
import { nextRunOf, parseCron } from '../../../console-ui/messaging/cron';
import { MessagingPanel, ResultView } from '../../../console-ui/messaging/MessagingPanel';
import { consoleReducer, type ConsoleState, initialConsoleState, serverView } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';
import { sampleWith } from '../helpers';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
// The page that recorded host-messages.json had sent the commands c-1 to c-4.
const state = recording.reduce<ConsoleState>(
  (current, message) => consoleReducer(current, { kind: 'message', message }),
  ['c-1', 'c-2', 'c-3', 'c-4'].reduce<ConsoleState>(
    (current, id) => consoleReducer(current, { kind: 'commandSent', id }),
    { ...initialConsoleState, connection: 'open' },
  ),
);
const snapshot = serverView(state).snapshot!;
const hello = serverView(state).hello!;

const EXPRESSIONS = [
  '0 3 * * *',
  '*/15 * * * *',
  '0/20 * * * *',
  '5,10-20/5 * * jan,mar *',
  '0 12 * * SUN-TUE',
  '0 0 * * 7',
  '0 0 * * 0-7',
  '15 2 * * 1-5',
  '0 */6 * * *',
  '*/7 */5 */3 */2 *',
  '59 23 31 12 *',
  '0 0 31 * *',
  '0 0 29 2 *',
  '0 0 30 2 *',
  '0 9 1 * MON',
  '0 0 */2 * MON',
  '30 4 1,15 * 5',
  '@yearly',
  '@annually',
  '@monthly',
  '@weekly',
  '@daily',
  '@midnight',
  '@hourly',
];

const STARTS = [
  '2026-11-05T10:30:20',
  '2026-11-05T10:30:00',
  '2026-12-31T23:59:00',
  '2026-02-28T23:59:30',
  '2027-03-28T02:30:00',
  '2026-10-25T03:30:00',
];

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const APP_ZONES = ['UTC', 'Europe/Istanbul', 'America/New_York', 'Asia/Kolkata', 'Australia/Lord_Howe'];

const ZONED_STARTS = [
  '2026-11-05T10:30:20Z',
  '2026-12-31T21:59:00Z',
  '2026-02-28T20:59:30Z',
  '2026-03-08T06:30:00Z',
  '2026-03-29T00:30:00Z',
  '2026-10-25T00:30:00Z',
  '2026-11-01T04:00:00Z',
  '2027-04-03T14:00:00Z',
  '2026-10-03T15:00:00Z',
];

// Bun re-reads `TZ` on every change. `bun test` starts in UTC without setting it, so the zone is restored, not the var.
const inZone = <T,>(zone: string, run: () => T): T => {
  const previous = Intl.DateTimeFormat().resolvedOptions().timeZone;

  process.env.TZ = zone;

  try {
    return run();
  } finally {
    process.env.TZ = previous;
  }
};

describe('cron next run', () => {
  test('agrees with Bun.cron.parse, which core schedules with, on every expression and start', () => {
    const differences = STARTS.flatMap((start) =>
      EXPRESSIONS.flatMap((expression) => {
        const from = new Date(start);
        const bun = Bun.cron.parse(expression, from)?.getTime() ?? null;
        const ours = nextRunOf(expression, from, LOCAL_ZONE);

        return ours.ok && (ours.at?.getTime() ?? null) === bun ? [] : [{ start, expression, bun, ours }];
      }),
    );

    expect(differences).toEqual([]);
  });

  test("agrees with Bun.cron.parse in the app's time zone while the browser sits in another", () => {
    const differences = APP_ZONES.flatMap((zone) => {
      const browserZone = zone === 'Asia/Tokyo' ? 'UTC' : 'Asia/Tokyo';

      return ZONED_STARTS.flatMap((start) =>
        EXPRESSIONS.flatMap((expression) => {
          const from = new Date(start);
          const bun = inZone(zone, () => Bun.cron.parse(expression, from)?.toISOString() ?? null);
          const ours = inZone(browserZone, () => nextRunOf(expression, from, zone));

          return ours.ok && (ours.at?.toISOString() ?? null) === bun ? [] : [{ zone, start, expression, bun, ours }];
        }),
      );
    });

    expect(differences).toEqual([]);
  });

  test('agrees with Bun.cron.parse through the hours the clocks skip or repeat', () => {
    const windows: [zone: string, from: string, to: string][] = [
      ['America/New_York', '2026-03-08T05:00:00Z', '2026-03-08T08:00:00Z'],
      ['America/New_York', '2026-11-01T04:00:00Z', '2026-11-01T07:30:00Z'],
      ['Europe/Berlin', '2026-03-29T00:00:00Z', '2026-03-29T02:00:00Z'],
      ['Europe/Berlin', '2026-10-25T00:00:00Z', '2026-10-25T02:00:00Z'],
      ['Australia/Lord_Howe', '2026-10-03T15:00:00Z', '2026-10-03T16:00:00Z'],
      ['Australia/Lord_Howe', '2026-04-04T14:30:00Z', '2026-04-04T15:30:00Z'],
    ];
    const expressions = ['30 2 * * *', '30 1 * * *', '0 1-3 * * *', '*/30 1 * * *', '0 * * * *', '*/15 * * * *'];
    const differences = windows.flatMap(([zone, start, end]) => {
      const froms: Date[] = [];

      for (let at = Date.parse(start); at <= Date.parse(end); at += 5 * 60_000) froms.push(new Date(at));

      return froms.flatMap((from) =>
        expressions.flatMap((expression) => {
          const bun = inZone(zone, () => Bun.cron.parse(expression, from)?.toISOString() ?? null);
          const ours = inZone('Asia/Tokyo', () => nextRunOf(expression, from, zone));

          return ours.ok && (ours.at?.toISOString() ?? null) === bun ? [] : [{ zone, from, expression, bun, ours }];
        }),
      );
    });

    expect(differences).toEqual([]);
  });

  test('a midnight job in a UTC app runs at UTC midnight, wherever the browser is', () => {
    const next = inZone('Europe/Istanbul', () => nextRunOf('0 0 * * *', new Date('2026-11-05T10:00:00Z'), 'UTC'));

    expect(next.ok && next.at?.toISOString()).toBe('2026-11-06T00:00:00.000Z');
  });

  test('rejects what Bun.cron.parse rejects', () => {
    for (const expression of ['0 0 ? * *', '30 25 * * *', '1-59/0 * * * *', '@reboot', '0 0 * *', '0 0 5-1 * *']) {
      expect(() => Bun.cron.parse(expression, new Date())).toThrow();
      expect(nextRunOf(expression, new Date(), LOCAL_ZONE).ok).toBe(false);
    }
  });

  test('both day fields restricted means either one; one of them * means the other alone', () => {
    expect(parseCron('0 9 1 * MON').dayOr).toBe(true);
    expect(parseCron('0 9 * * MON').dayOr).toBe(false);
    expect([...parseCron('0 0 * * 7').weekdays]).toEqual([0]);
  });

  test('says when the next run is, relative to now', () => {
    const now = new Date('2026-11-05T10:30:00');

    expect(formatNextRun(new Date('2026-11-05T10:45:00'), now, LOCAL_ZONE)).toBe('today 10:45 · in 15m');
    expect(formatNextRun(new Date('2026-11-06T03:00:00'), now, LOCAL_ZONE)).toBe('Fri 6 Nov 03:00 · in 16h 30m');
    expect(formatNextRun(new Date('2028-02-29T00:00:00'), now, LOCAL_ZONE)).toContain('2028');
  });

  test("reads the clock and the day in the app's time zone, and names it when the browser is elsewhere", () => {
    const now = new Date('2026-11-05T22:30:00Z');
    const at = new Date('2026-11-06T00:00:00Z');

    expect(formatNextRun(at, now, 'UTC', 'Europe/Istanbul')).toBe('Fri 6 Nov 00:00 UTC · in 1h 30m');
    expect(formatNextRun(at, now, 'Europe/Istanbul', 'Europe/Istanbul')).toBe('today 03:00 · in 1h 30m');
  });
});

describe('messaging commands', () => {
  test('each action builds a command the host accepts, without data when the editor was empty', () => {
    const commands: DevtoolsCommandRequest[] = [
      { id: nextCommandId(), ...scheduleCommand('NightlyCleanup') },
      { id: nextCommandId(), ...eventCommand('item.created', { id: '12' }) },
      { id: nextCommandId(), ...messageCommand(snapshot.messageHandlers[1]!, undefined) },
      { id: nextCommandId(), ...messageCommand(snapshot.messageHandlers[0]!, null) },
    ];

    for (const command of commands) expect(isConsoleBrowserMessage({ v: 1, type: 'command', command })).toBe(true);

    expect(commands[2]).not.toHaveProperty('data');
    expect(commands[3]).toMatchObject({ kind: 'event', pattern: 'inventory.restocked', data: null });
    expect(new Set(commands.map((command) => command.id)).size).toBe(commands.length);
  });

  test('a payload is optional JSON', () => {
    expect(parsePayload('  ')).toEqual({ ok: true });
    expect(parsePayload('{"id":"12"}')).toEqual({ ok: true, data: { id: '12' } });
    expect(parsePayload('null')).toEqual({ ok: true, data: null });
    expect(parsePayload('{id: 12}').ok).toBe(false);
  });

  test('a pattern is not an event an emit can name', () => {
    expect(isPattern('audit.*')).toBe(true);
    expect(isPattern('item.created')).toBe(false);
  });

  test('the last run of a schedule comes from the records core framed for it', () => {
    expect(lastDispatch(state.requests, '@Schedule', 'NightlyCleanup')?.id).toBe('r-6');
    expect(lastDispatch(state.requests, '@Schedule', 'Other')).toBeNull();
  });

  test("transport state comes from the server's part of the newest sample, else its hello", () => {
    const down = [{ name: 'default', connected: false }];
    const sample = sampleWith(state.metrics.at(-1)!, { transports: down });
    const other = sampleWith(state.metrics.at(-1)!, { transports: down }, 'server-2');

    expect(transportStates(hello, [sample])).toEqual(down);
    expect(transportStates(hello, [{ ...other, transports: down }])).toEqual([{ name: 'default', connected: true }]);
    expect(transportStates({ ...hello, serverId: 'server-2' }, [other])).toEqual(down);
    expect(transportStates(hello, [])).toEqual([{ name: 'default', connected: true }]);
    expect(transportStates(null, [sample])).toEqual([]);
  });

  test('says why nothing can be sent', () => {
    const ready = { canSend: true, token: 't', connected: true, hello };

    expect(commandBlockedReason(ready)).toBeNull();
    expect(commandBlockedReason({ ...ready, token: null })).toContain('No session token');
    expect(commandBlockedReason({ ...ready, connected: false })).toContain('Not connected');
    expect(commandBlockedReason({ ...ready, hello: null })).toContain('has not reported yet');
    expect(commandBlockedReason({ ...ready, stopped: true })).toContain('This server has stopped');
  });

  test('a command goes out addressed to the server its item came from, and not at all while blocked', () => {
    const sent: ConsoleBrowserMessage[] = [];
    const send = (message: ConsoleBrowserMessage) => sent.push(message) > 0;
    const command: DevtoolsCommandRequest = { id: 'c-9', ...scheduleCommand('NightlyCleanup') };

    expect(commandSender(send, { ...hello, serverId: 'server-2' }, null)?.(command)).toBe(true);
    expect(sent).toEqual([{ v: 1, type: 'command', command: { ...command, serverId: 'server-2' } }]);
    expect(sent.every(isConsoleBrowserMessage)).toBe(true);
    expect(commandSender(send, hello, 'Not connected')).toBeNull();
    expect(commandSender(send, null, null)).toBeNull();
    expect(commandSender(undefined, hello, null)).toBeNull();
  });

  test('groups keep first-seen order', () => {
    expect(groupBy(snapshot.events, (handler) => handler.event).map(([event]) => event)).toEqual([
      'audit.*',
      'item.created',
    ]);
  });

  test('a result shows the reply, a failure its error, and nothing yet while waiting', () => {
    const reply = state.commandResults['c-4']!;

    expect(resultText(reply)).toBe('{"reply":{"reserved":2,"sku":"lamp-01"}}');
    expect(renderToStaticMarkup(<ResultView result={reply} />)).toContain(
      '<span class="k">&quot;reserved&quot;</span>',
    );
    expect(renderToStaticMarkup(<ResultView result={state.commandResults['c-2']} />)).toContain(
      '<b>TimeoutError</b> No reply on inventory.reserve within 5000 ms',
    );
    expect(renderToStaticMarkup(<ResultView result={undefined} />)).toContain('Waiting for the app to answer');
    expect(renderToStaticMarkup(<ResultView result={{ id: 'x', ok: true }} />)).toContain('no result');
  });

  test('with several servers a result names the one that answered, or says that none did', () => {
    const labels = { 'server-1': 'Ergenecore :3000', 'server-2': 'Headless server-2' };
    const gone = {
      id: 'x',
      ok: false as const,
      error: { name: 'Error', message: 'No attached server has the id "server-3"; the command was not run' },
    };
    const view = (result: Parameters<typeof ResultView>[0]['result'], serverLabels?: Record<string, string>) =>
      renderToStaticMarkup(<ResultView result={result} serverLabels={serverLabels} />);

    expect(view(state.commandResults['c-4'], labels)).toContain(
      '<span class="muted">answered by Ergenecore :3000</span>',
    );
    expect(view(state.commandResults['c-2'], labels)).toContain('answered by Ergenecore :3000');
    expect(view({ id: 'x', ok: true, serverId: 'server-2' }, labels)).toContain('answered by Headless server-2');
    expect(view(gone, labels)).toContain('no server answered');
    expect(view(state.commandResults['c-4'])).not.toContain('answered');
    expect(view(gone)).not.toContain('answered');
  });
});

describe('messaging panel rendering', () => {
  const panel = (props: Partial<Parameters<typeof MessagingPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <MessagingPanel
        snapshot={snapshot}
        hello={hello}
        metrics={state.metrics}
        requests={state.requests}
        commandResults={state.commandResults}
        send={() => true}
        blockedReason={null}
        now={new Date('2026-11-05T10:30:00')}
        timeZone={LOCAL_ZONE}
        {...props}
      />,
    );

  test("shows a schedule's next run in the app's time zone when the browser is elsewhere", () => {
    const html = inZone('Europe/Istanbul', () => panel({ now: new Date('2026-11-05T10:30:00Z'), timeZone: 'UTC' }));

    expect(html).toContain('next Fri 6 Nov 03:00 UTC · in 16h 30m');
  });

  test('lists schedules with cron, next run and last run, events with their handlers, messages per transport', () => {
    const html = panel();

    expect(html).toContain('<span class="cmd-name">NightlyCleanup</span>');
    expect(html).toContain('0 3 * * *');
    expect(html).toContain('next Fri 6 Nov 03:00 · in 16h 30m');
    expect(html).toContain('<span class="st st-2">ok</span>');
    expect(html).toContain('audit.*');
    expect(html).toContain('ItemEvents.onCreated');
    expect(html).toContain('Messages · default');
    expect(html).toContain('connected');
    expect(html).toContain('@MessagePattern');
    expect(html).toContain('@EventPattern');
    expect(html.match(/<button type="button" class="icon-btn"/g)).toHaveLength(
      snapshot.schedules.length + 2 + snapshot.messageHandlers.length,
    );
    expect(html).not.toContain('Confirm');
    expect(html.match(/<div class="card-head">/g)).toHaveLength(3);
  });

  test('every action is off, with the reason, when nothing can be sent', () => {
    const html = panel({ send: null, blockedReason: 'Not connected to the console host.' });

    expect(html).toContain('Not connected to the console host.');
    expect(html).not.toMatch(/<button type="button" class="icon-btn">/);
  });

  test('says when the app has nothing to run', () => {
    const html = panel({ snapshot: { ...snapshot, schedules: [], events: [], messageHandlers: [] } });

    expect(html).toContain('Nothing to run');
  });
});
