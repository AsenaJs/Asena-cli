import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import {
  formatBytes,
  formatElapsed,
  formatUptime,
  quantile,
  sparkline,
  splitUnit,
} from '../../../console-ui/runtime/format';
import { LOG_ROW_HEIGHT, LogView, RUN_ROW_HEIGHT } from '../../../console-ui/runtime/LogView';
import {
  filterLogs,
  LOG_LEVELS,
  type LogFilter,
  logLevel,
  rowOffsets,
  stripAnsi,
  visibleWindow,
  withRunSeparators,
} from '../../../console-ui/runtime/logs';
import { healthDetail, RunTimeline, RuntimePanel } from '../../../console-ui/runtime/RuntimePanel';
import { causeText, exitText } from '../../../console-ui/runtime/runs';
import { consoleReducer, type ConsoleState, initialConsoleState, type LogEntry } from '../../../console-ui/state/store';
import hostMessagesJson from '../fixtures/host-messages.json';

const recording = hostMessagesJson as unknown as ConsoleHostMessage[];
const recorded: ConsoleState = recording.reduce(
  (state, message) => consoleReducer(state, { kind: 'message', message }),
  initialConsoleState,
);
const ESC = String.fromCharCode(27);

const entry = (seq: number, line: string, stream: 'stdout' | 'stderr' = 'stdout', gen = 1): LogEntry => ({
  gen,
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
    ['Error: boom', 'stderr', 'error'],
    [
      'Application error occurred: {\n  message: "boom",\n  stack: "Error: boom\\n    at broken (/app/x.ts:1:1)",\n}',
      'stderr',
      'error',
    ],
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

describe('run separators and windowing', () => {
  const shown = (logs: LogEntry[]) => filterLogs(logs, live);

  test('a separator goes where the run changes, not above the first line', () => {
    const rows = withRunSeparators(
      shown([entry(0, 'a'), entry(1, 'b'), entry(2, 'c', 'stdout', 2), entry(3, 'd', 'stdout', 3)]),
    );

    expect(rows.map((row) => (row.kind === 'run' ? `run ${row.gen}` : row.entry.line))).toEqual([
      'a',
      'b',
      'run 2',
      'c',
      'run 3',
      'd',
    ]);
  });

  test('renders only the rows in view plus the overscan, with rows of two heights', () => {
    const fixed = rowOffsets(Array.from({ length: 2000 }, () => 20));

    expect(visibleWindow(fixed, 0, 400, 10)).toEqual({ start: 0, end: 30, offsetTop: 0, totalHeight: 40_000 });
    expect(visibleWindow(fixed, 20_000, 400, 10)).toEqual({
      start: 990,
      end: 1030,
      offsetTop: 19_800,
      totalHeight: 40_000,
    });

    const mixed = rowOffsets([20, 20, 30, 20, 20]);

    expect(mixed).toEqual([0, 20, 40, 70, 90, 110]);
    expect(visibleWindow(mixed, 45, 20, 0)).toEqual({ start: 2, end: 3, offsetTop: 40, totalHeight: 110 });
  });

  test('stays inside the list at both ends', () => {
    const fixed = rowOffsets(Array.from({ length: 2000 }, () => 20));

    expect(visibleWindow(fixed, 39_900, 400, 10).end).toBe(2000);
    expect(visibleWindow(rowOffsets([20, 20, 20, 20, 20]), -50, 400, 10)).toEqual({
      start: 0,
      end: 5,
      offsetTop: 0,
      totalHeight: 100,
    });
    expect(visibleWindow(rowOffsets([]), 500, 400, 10)).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });
});

describe('formatting', () => {
  test('bytes, uptime, elapsed time and units', () => {
    expect(formatBytes(65_011_712)).toBe('62.0 MiB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatUptime(3725)).toBe('1h 2m 5s');
    expect(formatUptime(42)).toBe('42s');
    expect(formatElapsed(98_400)).toBe('1:38');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(splitUnit('62.0 MiB')).toEqual(['62.0', 'MiB']);
    expect(splitUnit('7')).toEqual(['7', '']);
    expect(quantile([5, 1, 3, 2, 4], 0.95)).toBe(5);
    expect(quantile([], 0.5)).toBe(0);
  });

  test('sparkline paths stay inside the box and end on the last sample', () => {
    expect(sparkline([1, 3, 2], 100, 10, 0)).toEqual({
      line: 'M0 10 L50 0 L100 5',
      area: 'M0 10 L50 0 L100 5 L100 10 L0 10Z',
      last: { x: 100, y: 5 },
    });
    expect(sparkline([4, 4], 100, 10).line).toBe('M0 5 L100 5');
    expect(sparkline([], 100, 10)).toEqual({ line: '', area: '', last: null });
  });

  test('a run says why it started and how it ended', () => {
    expect(causeText({ kind: 'start' })).toBe('started');
    expect(causeText({ kind: 'restart' })).toBe('restarted from the console');
    expect(causeText({ kind: 'change', files: ['src/services/ItemService.ts'] })).toBe(
      'src/services/ItemService.ts saved',
    );
    expect(causeText({ kind: 'change', files: ['src/a.ts', 'src/b.ts', 'src/c.ts'] })).toBe('src/a.ts +2 more saved');

    const run = { gen: 2, startedAt: 0, cause: { kind: 'restart' as const } };

    expect(exitText({ ...run, state: 'exited', code: 1 })).toBe('exited 1');
    expect(exitText({ ...run, state: 'exited', code: 0 })).toBeNull();
    expect(exitText({ ...run, state: 'exited', signal: 'SIGKILL' })).toBe('killed SIGKILL');
    expect(exitText({ ...run, state: 'running' })).toBeNull();
  });
});

describe('runtime panel rendering', () => {
  test('shows the health card, the timeline, the four metric cards and the log', () => {
    const replay = consoleReducer(initialConsoleState, { kind: 'message', message: recording[0]! });
    const html = renderToStaticMarkup(<RuntimePanel state={replay} />);

    expect(html).toContain('Ready');
    expect(html).toContain('Serving traffic');
    expect(html).toContain('Lifecycle STARTED · default connected');
    expect(html).toContain('Restarts this session');
    expect(html).toContain('Memory (RSS): 62.0 MiB, min 61.0 MiB, max 62.0 MiB over 3 samples');
    expect(html).toContain('Heap used');
    expect(html).toContain('of 32.0 MiB');
    expect(html).toContain('CPU');
    expect(html).toContain('Event-loop lag');
    expect(html).toContain('[warn] CORS allows every origin');
    expect(html).toContain('6 of 6 lines');
  });

  test('the whole recording shows three runs and a separator per new run', () => {
    const html = renderToStaticMarkup(<RuntimePanel state={recorded} />);

    expect(html).toContain('Run 1 · 0:00');
    expect(html).toContain('Run 2 · 0:15<span class="x">exited 1</span>');
    expect(html).toContain('Run 3 · 0:21 · ItemService.ts saved');
    expect(html).toContain('<span>Run 2 · ItemService.ts saved</span>');
    expect(html).toContain('<span>Run 3 · ItemService.ts saved</span>');
  });

  test('says when there are no samples yet', () => {
    const html = renderToStaticMarkup(<RuntimePanel state={initialConsoleState} />);

    expect(html).toContain('No app process yet');
    expect(html).toContain('Memory (RSS): no samples');
    expect(html).toContain('No run yet.');
  });

  test('the health line names the lifecycle and the transports', () => {
    const running = consoleReducer(initialConsoleState, { kind: 'message', message: recording[0]! });
    const sample = running.metrics.at(-1)!;

    expect(
      healthDetail({ ...running, metrics: [{ ...sample, readiness: { status: 'not_ready', state: 'STARTING' } }] }),
    ).toBe('Lifecycle STARTING');
    expect(
      healthDetail({
        ...running,
        hello: { ...running.hello!, transports: [] },
        metrics: [{ ...sample, transports: [] }],
      }),
    ).toBe('Lifecycle STARTED · no transports to wait for');
    expect(healthDetail({ ...running, metrics: [] })).toBe('Waiting for the first sample');
  });

  test('the timeline folds older runs into a count', () => {
    const runs = Array.from({ length: 9 }, (_, i) => ({
      gen: i + 1,
      startedAt: i * 1000,
      cause: { kind: 'restart' as const },
      state: 'exited' as const,
    }));
    const html = renderToStaticMarkup(<RunTimeline runs={runs} />);

    expect(html).toContain('3 earlier →');
    expect(html).not.toContain('Run 3 ·');
    expect(html).toContain('Run 9 · 0:08');
  });

  test('the log view renders a window of 2000 lines, not all of them', () => {
    const logs = Array.from({ length: 2000 }, (_, i) => entry(i, `line ${i}`));
    const html = renderToStaticMarkup(<LogView logs={logs} />);
    const rows = html.match(/class="log-row"/g) ?? [];

    expect(html).toContain('2000 of 2000 lines');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(html).toContain(`height:${2000 * LOG_ROW_HEIGHT}px`);
    expect(RUN_ROW_HEIGHT).toBeGreaterThan(LOG_ROW_HEIGHT);
  });

  test('a multi-line entry is one row as tall as its lines, and a Bun error report counts as an error', () => {
    const report =
      '10 |   console.error(new Error("boom"));\n                         ^\nerror: boom\n      at /app/x.ts:10:21';
    const html = renderToStaticMarkup(<LogView logs={[entry(0, 'before'), entry(1, report, 'stderr')]} />);

    expect(logLevel(report, 'stderr')).toBe('error');
    expect(html.match(/class="log-row"/g)).toHaveLength(2);
    expect(html).toContain(`height:${4 * LOG_ROW_HEIGHT}px`);
    expect(html).toContain(`height:${5 * LOG_ROW_HEIGHT}px`);
    expect(html).toContain('2 of 2 lines');
  });

  test('the level filter counts the lines of each level', () => {
    const html = renderToStaticMarkup(
      <LogView logs={[entry(0, 'ok'), entry(1, '[warn] slow'), entry(2, 'TypeError: x', 'stderr')]} />,
    );

    expect(html).toContain('Info<span class="n">1</span>');
    expect(html).toContain('Warnings<span class="n">1</span>');
    expect(html).toContain('Errors<span class="n">1</span>');
  });
});
