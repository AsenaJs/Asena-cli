import type { ConsoleLogStream } from '../../lib/console/hostProtocol';
import {
  LINE_LEAD,
  LOG_TIMESTAMP,
  markedLevel,
  type MarkedLevel,
  plainLevel,
  stripAnsi,
} from '../../lib/console/lines';
import type { LogEntry } from '../state/store';

export { stripAnsi };

export type LogLevel = MarkedLevel;

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info'];

// Multiline, since an entry can hold a whole Bun error report, whose `error: msg` line follows the source excerpt.
const ERROR_MARKERS = [
  /\[(?:[\w.-]+:)?(?:error|err|fatal)\]/i,
  new RegExp(String.raw`^${LINE_LEAD}(?:error|fatal)\b`, 'im'),
  /\b(?:[A-Z]\w*)?Error\b:/,
];

const WARN_MARKERS = [/\[(?:[\w.-]+:)?warn(?:ing)?\]/i, new RegExp(String.raw`^${LINE_LEAD}warn(?:ing)?\b`, 'im')];

/**
 * A guess from the text, since the host only knows the stream. The first line's marker (`[warn]`, `[ERROR]:`, `error:`,
 * `TypeError:`) decides, as an entry can hold a stack whatever its level. Without one, a marker in the body wins; an
 * unmarked stderr entry counts as a warning, an unmarked stdout entry as info.
 */
export const logLevel = (line: string, stream: ConsoleLogStream): LogLevel => {
  const text = stripAnsi(line);
  const marked = markedLevel(text);

  if (marked) return marked;
  if (ERROR_MARKERS.some((marker) => marker.test(text))) return 'error';
  if (WARN_MARKERS.some((marker) => marker.test(text))) return 'warn';

  return stream === 'stderr' ? 'warn' : 'info';
};

// A level in brackets, an upper-case word, or any case before a colon: `2026-11-06 01:19:47 info about` is a message.
const LOG_PREFIX = new RegExp(
  String.raw`^[ \t]*${LOG_TIMESTAMP}[ \t]+(?:\[[ \t]*([A-Za-z]+)[ \t]*\]|([A-Z]+)\b|([A-Za-z]+)(?=:))[ \t]*:?\s*`,
);

/**
 * `text` without a leading timestamp and level, when the console's own columns already say both; `null` when that
 * prefix was all of it. `text` is free of ANSI codes.
 */
export const withoutLogPrefix = (text: string, level: LogLevel): string | null => {
  const prefix = LOG_PREFIX.exec(text);
  const stated = (prefix?.[1] ?? prefix?.[2] ?? prefix?.[3] ?? '').toLowerCase();

  if (!prefix || plainLevel(stated) !== level) return text;

  const message = text.slice(prefix[0].length);

  return message === '' ? null : message;
};

/** The level and the message the console shows for a raw entry; `null` when there is nothing to show. */
export const shownLog = (line: string, stream: ConsoleLogStream): { level: LogLevel; text: string } | null => {
  const level = logLevel(line, stream);
  const text = withoutLogPrefix(stripAnsi(line), level);

  return text === null ? null : { level, text };
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

    const log = shownLog(entry.line, entry.stream);

    if (log === null || !filter.levels.has(log.level)) continue;
    // The shown text is a part of the raw one, so this covers both.
    if (query !== '' && !stripAnsi(entry.line).toLowerCase().includes(query)) continue;

    shown.push({ ...entry, ...log });
  }

  return shown;
};

export interface LogTally {
  /** Per level, what is newer than `clearedThrough`. */
  byLevel: Record<LogLevel, number>;
  total: number;
  /** What came in after `pausedAt`. */
  waiting: number;
}

/** Counts the entries that have something to show. */
export const tallyLogs = (logs: LogEntry[], filter: Pick<LogFilter, 'pausedAt' | 'clearedThrough'>): LogTally => {
  const tally: LogTally = { byLevel: { info: 0, warn: 0, error: 0 }, total: 0, waiting: 0 };

  for (const entry of logs) {
    const log = shownLog(entry.line, entry.stream);

    if (log === null) continue;

    tally.total++;

    if (entry.seq > filter.clearedThrough) tally.byLevel[log.level]++;
    if (filter.pausedAt !== null && entry.seq > filter.pausedAt) tally.waiting++;
  }

  return tally;
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
