import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../state/store';
import { formatClock } from './format';
import { filterLogs, LOG_LEVELS, type LogLevel, visibleWindow } from './logs';

export const LOG_ROW_HEIGHT = 20;

const DEFAULT_VIEWPORT_HEIGHT = 400;

const LEVEL_LABELS: Record<LogLevel, string> = { error: 'Errors', warn: 'Warnings', info: 'Info' };

export const LogView = ({ logs }: { logs: LogEntry[] }) => {
  const [levels, setLevels] = useState<ReadonlySet<LogLevel>>(() => new Set(LOG_LEVELS));
  const [search, setSearch] = useState('');
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [clearedThrough, setClearedThrough] = useState(-1);
  const [autoscroll, setAutoscroll] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const viewport = useRef<HTMLDivElement>(null);
  const lastSeq = logs.at(-1)?.seq ?? -1;

  const shown = useMemo(
    () => filterLogs(logs, { levels, search, pausedAt, clearedThrough }),
    [logs, levels, search, pausedAt, clearedThrough],
  );
  const rows = visibleWindow(scrollTop, viewportHeight, LOG_ROW_HEIGHT, shown.length);
  const waiting = pausedAt === null ? 0 : logs.filter((entry) => entry.seq > pausedAt).length;

  useEffect(() => {
    const element = viewport.current;

    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = viewport.current;

    if (autoscroll && element) element.scrollTop = element.scrollHeight;
  }, [autoscroll, shown.length]);

  const toggleLevel = (level: LogLevel) => {
    const next = new Set(levels);

    if (next.has(level)) {
      next.delete(level);
    } else {
      next.add(level);
    }

    setLevels(next);
  };

  return (
    <section className="log-view" aria-labelledby="log-title">
      <div className="log-toolbar">
        <h3 id="log-title">Output</h3>
        <fieldset className="log-levels">
          <legend className="visually-hidden">Show levels</legend>
          {LOG_LEVELS.map((level) => (
            <label key={level} data-level={level}>
              <input type="checkbox" checked={levels.has(level)} onChange={() => toggleLevel(level)} />
              {LEVEL_LABELS[level]}
            </label>
          ))}
        </fieldset>
        <input
          type="search"
          placeholder="Search output"
          aria-label="Search output"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          aria-pressed={pausedAt !== null}
          onClick={() => setPausedAt(pausedAt === null ? lastSeq : null)}
        >
          {pausedAt === null ? 'Pause' : `Resume${waiting > 0 ? ` (${waiting} new)` : ''}`}
        </button>
        <label>
          <input type="checkbox" checked={autoscroll} onChange={(event) => setAutoscroll(event.target.checked)} />
          Autoscroll
        </label>
        <button type="button" onClick={() => setClearedThrough(pausedAt ?? lastSeq)}>
          Clear
        </button>
        <span className="muted" aria-live="polite">
          {shown.length} of {logs.length} lines
        </span>
      </div>
      <div
        ref={viewport}
        className="log-viewport"
        role="log"
        aria-live="off"
        aria-label="App output"
        tabIndex={0}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: rows.totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${rows.offsetTop}px)` }}>
            {shown.slice(rows.start, rows.end).map((entry) => (
              <div
                key={entry.seq}
                className="log-row"
                data-level={entry.level}
                data-stream={entry.stream}
                style={{ height: LOG_ROW_HEIGHT }}
              >
                <span className="log-time">{formatClock(entry.at)}</span>
                <span className="log-gen" title={`Generation ${entry.gen}`}>
                  #{entry.gen}
                </span>
                <span className="log-text">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
