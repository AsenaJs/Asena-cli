import type { ConsoleLogStream } from '../../lib/console/hostProtocol';
import type { LogEntry } from '../state/store';

export type LogLevel = 'error' | 'warn' | 'info';

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info'];

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const ERROR_MARKERS = [
  /\[(?:[\w.-]+:)?(?:error|err|fatal)\]/i,
  /^\s*(?:error|fatal)\b/i,
  /\b[A-Z]\w*Error\b:/,
  /\bERROR\b/,
];

const WARN_MARKERS = [/\[(?:[\w.-]+:)?warn(?:ing)?\]/i, /^\s*warn(?:ing)?\b/i, /\bWARN(?:ING)?\b/];

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

export interface VisibleWindow {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

/** The rows `[start, end)` to render for a fixed-row-height list scrolled to `scrollTop`. */
export const visibleWindow = (
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 10,
): VisibleWindow => {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const start = Math.max(0, Math.min(count, first - overscan));
  const end = Math.min(count, first + Math.ceil(viewportHeight / rowHeight) + overscan);

  return { start, end: Math.max(start, end), offsetTop: start * rowHeight, totalHeight: count * rowHeight };
};
