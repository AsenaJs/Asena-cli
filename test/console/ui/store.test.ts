import { describe, expect, test } from 'bun:test';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import type { DevtoolsMetrics, DevtoolsSnapshot } from '../../../lib/console/protocol';
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

describe('consoleReducer over the recorded host messages', () => {
  test('the replay fills every slice for the current child', () => {
    const state = feed(recording.slice(0, 1));

    expect(state.child).toEqual({ gen: 1, state: 'running', pid: 48211 });
    expect(state.hello?.pid).toBe(48211);
    expect(state.snapshot).toEqual(snapshot);
    expect(state.snapshotGen).toBe(1);
    expect(state.metrics.map((sample) => sample.uptimeSeconds)).toEqual([3, 4, 5]);
    expect(state.logs.map((entry) => entry.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state.requests.map((record) => record.id)).toEqual(['r-1', 'r-2']);
    expect(isSnapshotStale(state)).toBe(false);
  });

  test('a respawn drops the old child hello and metrics, keeps the snapshot marked stale and keeps the logs', () => {
    const state = feedUntil((message) => message.type === 'child' && message.gen === 2);

    expect(state.child).toEqual({ gen: 2, state: 'starting', pid: 48390 });
    expect(state.hello).toBeNull();
    expect(state.metrics).toEqual([]);
    expect(state.snapshot).toEqual(snapshot);
    expect(state.snapshotGen).toBe(1);
    expect(isSnapshotStale(state)).toBe(true);
    expect(state.logs.some((entry) => entry.line.includes('SIGTERM received'))).toBe(true);
  });

  test('a crashed child reports its exit code and its stderr stays in the log', () => {
    const state = feedUntil((message) => message.type === 'child' && message.gen === 2 && message.state === 'exited');

    expect(state.child).toEqual({ gen: 2, state: 'exited', pid: 48390, code: 1 });
    expect(state.logs.at(-1)).toMatchObject({ gen: 2, stream: 'stderr' });
  });

  test('the whole recording ends on generation 3 with its own hello, snapshot and metrics', () => {
    const state = feed(recording);
    const logLines = recording.filter((message) => message.type === 'log').length;

    expect(state.child).toEqual({ gen: 3, state: 'running', pid: 48466 });
    expect(state.hello?.pid).toBe(48466);
    expect(state.snapshotGen).toBe(3);
    expect(isSnapshotStale(state)).toBe(false);
    expect(state.metrics.map((sample) => sample.uptimeSeconds)).toEqual([1]);
    expect(state.logs).toHaveLength(6 + logLines);
    expect(state.logs.map((entry) => entry.seq)).toEqual(state.logs.map((_, i) => i));
    expect(state.requests.map((record) => record.id)).toEqual(['r-1', 'r-2', 'r-3', 'r-4', 'r-5']);
    expect(state.commandResults['c-1']).toEqual({ id: 'c-1', ok: true, result: { ran: 'NightlyCleanup' } });
    expect(state.commandResults['c-2']?.ok).toBe(false);
  });
});

describe('consoleReducer generations', () => {
  const running = feed(recording.slice(0, 1));

  test('ignores a child message from an older generation', () => {
    const respawned = feed([{ v: 1, type: 'child', gen: 2, state: 'running', pid: 2 }], running);
    const late = feed([{ v: 1, type: 'child', gen: 1, state: 'exited', code: 0 }], respawned);

    expect(late.child).toEqual({ gen: 2, state: 'running', pid: 2 });
  });

  test('a state change within one generation keeps hello and metrics', () => {
    const restarting = feed([{ v: 1, type: 'child', gen: 1, state: 'restarting', pid: 48211 }], running);

    expect(restarting.child?.state).toBe('restarting');
    expect(restarting.hello).toBe(running.hello);
    expect(restarting.metrics).toBe(running.metrics);
  });

  test('a later replay replaces the slices it carries, keeps command results and continues the log sequence', () => {
    const withResult = feed(recording, running);
    const replay = feed(
      [{ v: 1, type: 'snapshotState', child: { gen: 1, state: 'starting' }, metrics: [], logs: [], requests: [] }],
      withResult,
    );

    expect(replay.child).toEqual({ gen: 1, state: 'starting' });
    expect(replay.hello).toBeNull();
    expect(replay.snapshot).toBeNull();
    expect(replay.snapshotGen).toBeNull();
    expect(replay.logs).toEqual([]);
    expect(replay.commandResults).toEqual(withResult.commandResults);
    expect(replay.nextLogSeq).toBe(withResult.nextLogSeq);
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

  test('keeps the last 2000 log lines and keeps numbering past the dropped ones', () => {
    const lines = Array.from({ length: 2005 }, (_, i): ConsoleHostMessage => ({
      v: 1,
      type: 'log',
      gen: 1,
      stream: 'stdout',
      line: `line ${i}`,
      at: i,
    }));
    const state = feed(lines);

    expect(state.logs).toHaveLength(2000);
    expect(state.logs[0]).toEqual({ gen: 1, stream: 'stdout', line: 'line 5', at: 5, seq: 5 });
    expect(state.nextLogSeq).toBe(2005);
  });

  test('trims an oversized replay to the replay limits', () => {
    const logs = Array.from({ length: 2001 }, (_, i) => ({ gen: 1, stream: 'stdout' as const, line: '', at: i }));
    const state = feed([
      {
        v: 1,
        type: 'snapshotState',
        child: { gen: 1, state: 'running' },
        metrics: Array.from({ length: 121 }, (_, i) => metrics(i)),
        logs,
        requests: [],
      },
    ]);

    expect(state.metrics).toHaveLength(120);
    expect(state.logs).toHaveLength(2000);
    expect(state.logs[0]?.at).toBe(1);
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
