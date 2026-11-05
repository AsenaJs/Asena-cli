import type { ConsoleLogStream } from '../../lib/console/hostProtocol';
import type { LogEntry } from '../state/store';

export type LogLevel = 'error' | 'warn' | 'info';

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info'];

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

// Multiline, since an entry can hold a whole Bun error report, whose `error: msg` line follows the source excerpt.
const ERROR_MARKERS = [
  /\[(?:[\w.-]+:)?(?:error|err|fatal)\]/i,
  /^[^\S\n]*(?:error|fatal)\b/im,
  /\b[A-Z]\w*Error\b:/,
  /\bERROR\b/,
];

const WARN_MARKERS = [/\[(?:[\w.-]+:)?warn(?:ing)?\]/i, /^[^\S\n]*warn(?:ing)?\b/im, /\bWARN(?:ING)?\b/];

export const stripAnsi = (line: string): string => line.replace(ANSI_ESCAPE, '');

/**
 * A guess from the text, since the host only knows the stream: a level marker (`[warn]`, `[ERROR]:`,
 * `error:`, `TypeError:`) wins; an unmarked stderr line counts as a warning, an unmarked stdout line as info.
 */
export const logLevel = (line: string, stream: ConsoleLogStream): LogLevel => {
  const text = stripAnsi(line);

  if (ERROR_MARKERS.some((marker) => marker.test(text))) return 'error';
  if (WARN_MARKERS.some((marker) => marker.test(text))) return 'warn';

  return stream === 'stderr' ? 'warn' : 'info';
};

export interface LogFilter {
  levels: ReadonlySet<LogLevel>;
  search: string;
  /** Show nothing newer than this sequence number; `null` when live. */
  pausedAt: number | null;
  /** Hide everything up to and including this sequence number. */
  clearedThrough: number;
}

export interface ShownLogEntry extends LogEntry {
  level: LogLevel;
  text: string;
}

export const filterLogs = (logs: LogEntry[], filter: LogFilter): ShownLogEntry[] => {
  const query = filter.search.trim().toLowerCase();
  const shown: ShownLogEntry[] = [];

  for (const entry of logs) {
    if (entry.seq <= filter.clearedThrough) continue;
    if (filter.pausedAt !== null && entry.seq > filter.pausedAt) break;

    const level = logLevel(entry.line, entry.stream);
    const text = stripAnsi(entry.line);

    if (!filter.levels.has(level)) continue;
    if (query !== '' && !text.toLowerCase().includes(query)) continue;

    shown.push({ ...entry, level, text });
  }

  return shown;
};

export type LogRow = { kind: 'line'; entry: ShownLogEntry } | { kind: 'run'; gen: number; key: string };

/** The shown lines with a run separator wherever the generation changes, not above the first line. */
export const withRunSeparators = (shown: ShownLogEntry[]): LogRow[] => {
  const rows: LogRow[] = [];
  let gen: number | null = null;

  for (const entry of shown) {
    if (gen !== null && entry.gen !== gen) rows.push({ kind: 'run', gen: entry.gen, key: `run-${entry.seq}` });

    gen = entry.gen;
    rows.push({ kind: 'line', entry });
  }

  return rows;
};

export interface VisibleWindow {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

/** Each row's top, plus the total height as the last element. */
export const rowOffsets = (heights: number[]): number[] => {
  const offsets = [0];

  for (const height of heights) offsets.push((offsets[offsets.length - 1] ?? 0) + height);

  return offsets;
};

/** The rows `[start, end)` to render for a list with the given `rowOffsets`, scrolled to `scrollTop`. */
export const visibleWindow = (
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 10,
): VisibleWindow => {
  const count = offsets.length - 1;
  const totalHeight = offsets[count] ?? 0;
  const top = Math.max(0, scrollTop);
  let low = 0;
  let high = count;

  while (low < high) {
    const mid = (low + high) >> 1;

    if ((offsets[mid + 1] ?? 0) <= top) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  let last = low;

  while (last < count && (offsets[last] ?? 0) < top + viewportHeight) last++;

  const start = Math.max(0, Math.min(count, low - overscan));
  const end = Math.min(count, last + overscan);

  return { start, end: Math.max(start, end), offsetTop: offsets[start] ?? 0, totalHeight };
};
