import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import { formatBytes, formatUptime, sparklinePoints } from '../../../console-ui/runtime/format';
import { LogView } from '../../../console-ui/runtime/LogView';
import {
  filterLogs,
  LOG_LEVELS,
  type LogFilter,
  logLevel,
  stripAnsi,
  visibleWindow,
} from '../../../console-ui/runtime/logs';
import { ReadinessBadge, RuntimePanel } from '../../../console-ui/runtime/RuntimePanel';
import { consoleReducer, type ConsoleState, initialConsoleState, type LogEntry } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const recorded: ConsoleState = recording.reduce(
  (state, message) => consoleReducer(state, { kind: 'message', message }),
  initialConsoleState,
);
const ESC = String.fromCharCode(27);

const entry = (seq: number, line: string, stream: 'stdout' | 'stderr' = 'stdout'): LogEntry => ({
  gen: 1,
  stream,
  line,
  at: seq,
  seq,
});

const live: LogFilter = { levels: new Set(LOG_LEVELS), search: '', pausedAt: null, clearedThrough: -1 };

describe('logLevel heuristics', () => {
  test.each([
    ['[warn] CORS allows every origin', 'stderr', 'warn'],
    ["TypeError: undefined is not an object (evaluating 'item.name')", 'stderr', 'error'],
    ["error: Cannot find module './ItemRepositry' from '/srv/app/src/ItemService.ts'", 'stderr', 'error'],
    ['[AsenaServer] SIGTERM received, shutting down', 'stdout', 'info'],
    ['Rename of item 7 rejected: name taken', 'stdout', 'info'],
    ['[app:warn] asena-config file not found', 'stderr', 'warn'],
    [`2026-11-05 10:00:00 [${ESC}[31mERROR${ESC}[39m]: \tboom`, 'stdout', 'error'],
    [`2026-11-05 10:00:00 [${ESC}[33mWARN${ESC}[39m]: \tslow query`, 'stdout', 'warn'],
    ['[error] Lost connection to the broker', 'stdout', 'error'],
    ['Warning: deprecated option', 'stdout', 'warn'],
    ['    at ItemService.find (/srv/app/src/ItemService.ts:12:5)', 'stderr', 'warn'],
    ['errors resolved: 0', 'stdout', 'info'],
    ['ErrorBoundary mounted', 'stdout', 'info'],
  ] as const)('%s on %s is %s', (line, stream, level) => {
    expect(logLevel(line, stream)).toBe(level);
  });

  test('ANSI colour codes are stripped for display and search', () => {
    expect(stripAnsi(`${ESC}[32mready${ESC}[0m in ${ESC}[1;31m3${ESC}[0m ms`)).toBe('ready in 3 ms');
  });

  test('every line of the recording gets the level its marker says', () => {
    const levelOf = (level: string) =>
      recorded.logs.filter((line) => logLevel(line.line, line.stream) === level).map((line) => line.line);

    expect(levelOf('error')).toEqual([
      "TypeError: undefined is not an object (evaluating 'item.name')",
      "error: Cannot find module './ItemRepositry' from '/srv/app/src/ItemService.ts'",
    ]);
    expect(levelOf('warn')).toEqual(['[warn] CORS allows every origin']);
    expect(levelOf('info')).toHaveLength(recorded.logs.length - 3);
  });
});

describe('filterLogs', () => {
  const logs = [
    entry(0, 'server started'),
    entry(1, '[warn] slow'),
    entry(2, 'TypeError: x', 'stderr'),
    entry(3, `${ESC}[32mItem 7${ESC}[0m created`),
  ];

  test('filters by level', () => {
    expect(filterLogs(logs, { ...live, levels: new Set(['error', 'warn']) }).map((line) => line.seq)).toEqual([1, 2]);
  });

  test('searches the text without ANSI codes, case-insensitively', () => {
    expect(filterLogs(logs, { ...live, search: ' item 7 CREATED' }).map((line) => line.text)).toEqual([
      'Item 7 created',
    ]);
  });

  test('a pause shows nothing newer than the line it was taken at', () => {
    expect(filterLogs(logs, { ...live, pausedAt: 1 }).map((line) => line.seq)).toEqual([0, 1]);
  });

  test('clear hides what was there and keeps what comes after', () => {
    expect(filterLogs([...logs, entry(4, 'after')], { ...live, clearedThrough: 3 }).map((line) => line.seq)).toEqual([
      4,
    ]);
  });
});

describe('visibleWindow', () => {
  test('renders only the rows in view plus the overscan', () => {
    expect(visibleWindow(0, 400, 20, 2000, 10)).toEqual({ start: 0, end: 30, offsetTop: 0, totalHeight: 40_000 });
    expect(visibleWindow(20_000, 400, 20, 2000, 10)).toEqual({
      start: 990,
      end: 1030,
      offsetTop: 19_800,
      totalHeight: 40_000,
    });
  });

  test('stays inside the list at both ends', () => {
    expect(visibleWindow(39_900, 400, 20, 2000, 10).end).toBe(2000);
    expect(visibleWindow(-50, 400, 20, 5, 10)).toEqual({ start: 0, end: 5, offsetTop: 0, totalHeight: 100 });
    expect(visibleWindow(500, 400, 20, 0, 10)).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });
});

describe('formatting', () => {
  test('bytes, uptime and sparkline points', () => {
    expect(formatBytes(65_011_712)).toBe('62.0 MiB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatUptime(3725)).toBe('1h 2m 5s');
    expect(formatUptime(42)).toBe('42s');
    expect(sparklinePoints([1, 3, 2], 100, 10)).toBe('0.0,10.0 50.0,0.0 100.0,5.0');
    expect(sparklinePoints([4, 4], 100, 10)).toBe('0.0,5.0 100.0,5.0');
    expect(sparklinePoints([], 100, 10)).toBe('');
  });
});

describe('runtime panel rendering', () => {
  test('shows readiness, uptime, the four metrics and the log', () => {
    const replay = consoleReducer(initialConsoleState, { kind: 'message', message: recording[0]! });
    const html = renderToStaticMarkup(<RuntimePanel state={replay} />);

    expect(html).toContain('>Up<');
    expect(html).toContain('default: connected');
    expect(html).toContain('>5s<');
    expect(html).toContain('RSS: 62.0 MiB, min 61.0 MiB, max 62.0 MiB over 3 samples');
    expect(html).toContain('Heap used');
    expect(html).toContain('CPU');
    expect(html).toContain('Event-loop lag');
    expect(html).toContain('[warn] CORS allows every origin');
    expect(html).toContain('6 of 6 lines');
  });

  test('says when there are no samples yet', () => {
    const html = renderToStaticMarkup(<RuntimePanel state={initialConsoleState} />);

    expect(html).toContain('No samples yet');
    expect(html).toContain('RSS: no samples');
  });

  test('a not-ready or degraded app shows its state and its transports', () => {
    const notReady = renderToStaticMarkup(<ReadinessBadge readiness={{ status: 'not_ready', state: 'STARTING' }} />);
    const degraded = renderToStaticMarkup(
      <ReadinessBadge readiness={{ status: 'degraded', transports: { default: 'disconnected' } }} />,
    );

    expect(notReady).toContain('Not ready (STARTING)');
    expect(degraded).toContain('Degraded');
    expect(degraded).toContain('default: disconnected');
  });

  test('the log view renders a window of 2000 lines, not all of them', () => {
    const logs = Array.from({ length: 2000 }, (_, i) => entry(i, `line ${i}`));
    const html = renderToStaticMarkup(<LogView logs={logs} />);
    const rows = html.match(/class="log-row"/g) ?? [];

    expect(html).toContain('2000 of 2000 lines');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(html).toContain('height:40000px');
  });
});
