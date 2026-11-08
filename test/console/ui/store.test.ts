import { describe, expect, test } from 'bun:test';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import type { DevtoolsCommandResult, DevtoolsMetrics, DevtoolsSnapshot } from '../../../lib/console/protocol';
import { filterLogs, LOG_LEVELS } from '../../../console-ui/runtime/logs';
import {
  consoleReducer,
  type ConsoleState,
  initialConsoleState,
  isSnapshotStale,
} from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';
import snapshotJson from '../fixtures/snapshot.json';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const snapshot = snapshotJson as unknown as DevtoolsSnapshot;

const feed = (messages: ConsoleHostMessage[], from: ConsoleState = initialConsoleState): ConsoleState =>
  messages.reduce((state, message) => consoleReducer(state, { kind: 'message', message }), from);

/** The state after the recording up to and including the first message `match` accepts. */
const feedUntil = (match: (message: ConsoleHostMessage) => boolean): ConsoleState => {
  const end = recording.findIndex(match);

  expect(end).toBeGreaterThanOrEqual(0);

  return feed(recording.slice(0, end + 1));
};

const metrics = (uptimeSeconds: number): DevtoolsMetrics => ({
  rss: 1,
  heapUsed: 1,
  heapTotal: 2,
  cpuPercent: 0,
  eventLoopLagMs: 0,
  uptimeSeconds,
  readiness: { status: 'up' },
});

/** The page that recorded host-messages.json had sent the commands its results answer. */
const sentRecordedCommands = (from: ConsoleState): ConsoleState =>
  ['c-1', 'c-2', 'c-3', 'c-4'].reduce((state, id) => consoleReducer(state, { kind: 'commandSent', id }), from);

const runSummary = (state: ConsoleState) =>
  state.runs.map(({ gen, state: runState, code, cause }) => ({ gen, state: runState, code, cause: cause.kind }));

describe('consoleReducer over the recorded host messages', () => {
  test('the replay fills every slice for the current child', () => {
    const state = feed(recording.slice(0, 1));

    expect(state.child).toMatchObject({ gen: 1, state: 'running', pid: 48211 });
    expect(state.hello?.pid).toBe(48211);
    expect(state.snapshot).toEqual(snapshot);
    expect(state.snapshotGen).toBe(1);
    expect(state.timeZone).toBe('Europe/Istanbul');
    expect(state.metrics.map((sample) => sample.uptimeSeconds)).toEqual([3, 4, 5]);
    expect(state.logs.map((entry) => entry.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state.requests.map((record) => record.id)).toEqual(['r-1', 'r-2']);
    expect(runSummary(state)).toEqual([{ gen: 1, state: 'running', code: undefined, cause: 'start' }]);
    expect(isSnapshotStale(state)).toBe(false);
  });

  test('a respawn drops the old child hello and metrics, keeps the snapshot marked stale and keeps the logs', () => {
    const state = feedUntil((message) => message.type === 'child' && message.gen === 2);

    expect(state.child).toMatchObject({ gen: 2, state: 'starting', pid: 48390 });
    expect(state.hello).toBeNull();
    expect(state.metrics).toEqual([]);
    expect(state.snapshot).toEqual(snapshot);
    expect(state.snapshotGen).toBe(1);
    expect(isSnapshotStale(state)).toBe(true);
    expect(state.logs.some((entry) => entry.line.includes('SIGTERM received'))).toBe(true);
    expect(state.runs.at(-1)).toEqual({
      gen: 2,
      startedAt: 1762329615100,
      cause: { kind: 'change', files: ['ItemService.ts'] },
      state: 'starting',
    });
  });

  test('a crashed child reports its exit code and its stderr stays in the log', () => {
    const state = feedUntil((message) => message.type === 'child' && message.gen === 2 && message.state === 'exited');

    expect(state.child).toMatchObject({ gen: 2, state: 'exited', pid: 48390, code: 1 });
    expect(state.logs.at(-1)).toMatchObject({ gen: 2, stream: 'stderr' });
    expect(state.runs.at(-1)).toMatchObject({ gen: 2, state: 'exited', code: 1 });
  });

  test('the whole recording ends on generation 3 with its own hello, snapshot and metrics', () => {
    const state = feed(recording, sentRecordedCommands(initialConsoleState));
    const logLines = recording.filter((message) => message.type === 'log').length;

    expect(state.child).toMatchObject({ gen: 3, state: 'running', pid: 48466 });
    expect(state.hello?.pid).toBe(48466);
    expect(state.snapshotGen).toBe(3);
    expect(isSnapshotStale(state)).toBe(false);
    expect(state.metrics.map((sample) => sample.uptimeSeconds)).toEqual([1]);
    expect(state.logs).toHaveLength(6 + logLines);
    expect(state.logs.map((entry) => entry.seq)).toEqual(state.logs.map((_, i) => i));
    expect(state.requests.map((record) => record.id)).toEqual(Array.from({ length: 11 }, (_, i) => `r-${i + 1}`));
    expect(state.commandResults['c-1']).toEqual({ id: 'c-1', ok: true, result: { ran: 'NightlyCleanup' } });
    expect(state.commandResults['c-2']?.ok).toBe(false);
    expect(Object.keys(state.commandResults)).toEqual(['c-1', 'c-2', 'c-3', 'c-4']);
    expect(runSummary(state)).toEqual([
      { gen: 1, state: 'exited', code: 0, cause: 'start' },
      { gen: 2, state: 'exited', code: 1, cause: 'change' },
      { gen: 3, state: 'running', code: undefined, cause: 'change' },
    ]);
  });
});

describe('consoleReducer generations', () => {
  const running = feed(recording.slice(0, 1));

  test('ignores a child message from an older generation', () => {
    const respawned = feed([{ v: 1, type: 'child', gen: 2, state: 'running', pid: 2 }], running);
    const late = feed([{ v: 1, type: 'child', gen: 1, state: 'exited', code: 0 }], respawned);

    expect(late.child).toEqual({ gen: 2, state: 'running', pid: 2 });
    expect(late.runs.map((run) => run.gen)).toEqual([1, 2]);
  });

  test('a state change within one generation keeps hello and metrics', () => {
    const restarting = feed([{ v: 1, type: 'child', gen: 1, state: 'restarting', pid: 48211 }], running);

    expect(restarting.child?.state).toBe('restarting');
    expect(restarting.hello).toBe(running.hello);
    expect(restarting.metrics).toBe(running.metrics);
    expect(restarting.runs).toEqual([{ ...running.runs[0]!, state: 'restarting' }]);
  });

  test('keeps that the host ended a child, on the child and on its run', () => {
    const killed = feed(
      [{ v: 1, type: 'child', gen: 1, state: 'exited', pid: 48211, signal: 'SIGKILL', endedBy: 'restart' }],
      running,
    );

    expect(killed.child).toMatchObject({ signal: 'SIGKILL', endedBy: 'restart' });
    expect(killed.runs.at(-1)).toMatchObject({ signal: 'SIGKILL', endedBy: 'restart' });
  });

  test('a later replay replaces the slices it carries and keeps command results', () => {
    const withResult = feed(recording, sentRecordedCommands(running));
    const replay = feed(
      [
        {
          v: 1,
          type: 'snapshotState',
          timeZone: 'UTC',
          child: { gen: 1, state: 'starting' },
          runs: [],
          metrics: [],
          logs: [],
          requests: [],
          commandResults: [],
        },
      ],
      withResult,
    );

    expect(replay.child).toEqual({ gen: 1, state: 'starting' });
    expect(replay.hello).toBeNull();
    expect(replay.snapshot).toBeNull();
    expect(replay.snapshotGen).toBeNull();
    expect(replay.logs).toEqual([]);
    expect(replay.runs).toEqual([]);
    expect(replay.commandResults).toEqual(withResult.commandResults);
  });

  test('a reconnect replay keeps the numbers the host gave each line, so a clear stays cleared', () => {
    const live = feed(recording);
    const clearedThrough = live.logs.at(-1)!.seq;
    const reconnected = feed(
      [
        {
          v: 1,
          type: 'snapshotState',
          timeZone: 'UTC',
          child: live.child!,
          runs: live.runs,
          metrics: [],
          logs: live.logs,
          requests: [],
          commandResults: [],
        },
        { v: 1, type: 'log', seq: clearedThrough + 1, gen: 3, stream: 'stdout', line: 'after the reconnect', at: 1 },
      ],
      live,
    );
    const shown = filterLogs(reconnected.logs, {
      levels: new Set(LOG_LEVELS),
      search: '',
      pausedAt: null,
      clearedThrough,
    });

    expect(reconnected.logs.map((entry) => entry.seq)).toEqual([
      ...live.logs.map((entry) => entry.seq),
      clearedThrough + 1,
    ]);
    expect(shown.map((entry) => entry.line)).toEqual(['after the reconnect']);
  });
});

describe('consoleReducer limits', () => {
  test('keeps the last 120 metrics samples', () => {
    const samples = Array.from({ length: 130 }, (_, i): ConsoleHostMessage => ({
      v: 1,
      type: 'agent',
      message: { v: 1, type: 'metrics', payload: metrics(i) },
    }));
    const state = feed(samples);

    expect(state.metrics).toHaveLength(120);
    expect(state.metrics[0]?.uptimeSeconds).toBe(10);
  });

  test('keeps the last 2000 log lines with the numbers the host gave them', () => {
    const lines = Array.from({ length: 2005 }, (_, i): ConsoleHostMessage => ({
      v: 1,
      type: 'log',
      seq: i,
      gen: 1,
      stream: 'stdout',
      line: `line ${i}`,
      at: i,
    }));
    const state = feed(lines);

    expect(state.logs).toHaveLength(2000);
    expect(state.logs[0]).toEqual({ seq: 5, gen: 1, stream: 'stdout', line: 'line 5', at: 5 });
  });

  test('trims an oversized replay to the replay limits', () => {
    const logs = Array.from({ length: 2001 }, (_, i) => ({
      seq: i,
      gen: 1,
      stream: 'stdout' as const,
      line: '',
      at: i,
    }));
    const runs = Array.from({ length: 51 }, (_, i) => ({
      gen: i + 1,
      startedAt: i,
      cause: { kind: 'restart' as const },
      state: 'exited' as const,
    }));
    const state = feed([
      {
        v: 1,
        type: 'snapshotState',
        timeZone: 'UTC',
        child: { gen: 51, state: 'exited' },
        runs,
        metrics: Array.from({ length: 121 }, (_, i) => metrics(i)),
        logs,
        requests: [],
        commandResults: [],
      },
    ]);

    expect(state.metrics).toHaveLength(120);
    expect(state.logs).toHaveLength(2000);
    expect(state.logs[0]?.at).toBe(1);
    expect(state.runs).toHaveLength(50);
    expect(state.runs[0]?.gen).toBe(2);
  });
});

describe('consoleReducer command results', () => {
  const running = feed(recording.slice(0, 1));
  const sent = (state: ConsoleState, id: string) => consoleReducer(state, { kind: 'commandSent', id });
  const result = (id: string): DevtoolsCommandResult => ({ id, ok: true, result: { ran: id } });
  const live = (id: string): ConsoleHostMessage => ({
    v: 1,
    type: 'agent',
    message: { v: 1, type: 'commandResult', payload: result(id) },
  });
  const replay = (results: DevtoolsCommandResult[]): ConsoleHostMessage => ({
    v: 1,
    type: 'snapshotState',
    timeZone: 'UTC',
    child: running.child!,
    runs: running.runs,
    metrics: [],
    logs: [],
    requests: [],
    commandResults: results,
  });

  test('a live result resolves a command this page sent; one for an id it never sent is dropped', () => {
    const state = feed([live('mine'), live('other-tab')], sent(running, 'mine'));

    expect(state.commandResults).toEqual({ mine: result('mine') });
    expect(state.pendingCommands).toEqual([]);
  });

  // A result that arrived while the socket was reconnecting reaches the page only through the replay.
  test('a reconnect replay resolves a command still pending and drops the results this page never asked for', () => {
    const waiting = sent(sent(running, 'answered'), 'lost-in-reconnect');
    const before = feed([live('answered')], waiting);

    expect(before.pendingCommands).toEqual(['lost-in-reconnect']);

    const after = feed([replay([result('other-tab'), result('answered'), result('lost-in-reconnect')])], before);

    expect(after.commandResults).toEqual({
      answered: result('answered'),
      'lost-in-reconnect': result('lost-in-reconnect'),
    });
    expect(after.pendingCommands).toEqual([]);
  });
});

describe('consoleReducer connection', () => {
  test('tracks the socket status without touching the data', () => {
    const running = feed(recording.slice(0, 1));
    const closed = consoleReducer(running, { kind: 'connection', status: 'closed' });

    expect(closed.connection).toBe('closed');
    expect(closed.snapshot).toBe(running.snapshot);
  });
});
