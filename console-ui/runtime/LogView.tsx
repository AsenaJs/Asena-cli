import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ConsoleRun } from '../../lib/console/hostProtocol';
import type { LogEntry } from '../state/store';
import { Card, IconButton, SearchField, SegmentedControl } from '../ui/components';
import { formatClock } from './format';
import {
  filterLogs,
  LOG_LEVELS,
  type LogLevel,
  type LogRow,
  rowOffsets,
  stripAnsi,
  tallyLogs,
  visibleWindow,
  withRunSeparators,
} from './logs';
import { causeText } from './runs';

export const LOG_ROW_HEIGHT = 21;

export const RUN_ROW_HEIGHT = 32;

const DEFAULT_VIEWPORT_HEIGHT = 400;

// Close enough to the end that new lines keep the view pinned there.
const STICK_DISTANCE = 24;

const LEVEL_LABELS: Record<LogLevel, string> = { info: 'Info', warn: 'Warnings', error: 'Errors' };

const LEVEL_ORDER: LogLevel[] = ['info', 'warn', 'error'];

const rowHeight = (row: LogRow): number =>
  row.kind === 'run' ? RUN_ROW_HEIGHT : LOG_ROW_HEIGHT * row.entry.text.split('\n').length;

export const LogView = ({ logs, runs = [] }: { logs: LogEntry[]; runs?: ConsoleRun[] }) => {
  const [levels, setLevels] = useState<ReadonlySet<LogLevel>>(() => new Set(LOG_LEVELS));
  const [search, setSearch] = useState('');
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [clearedThrough, setClearedThrough] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const stick = useRef(true);
  const viewport = useRef<HTMLDivElement>(null);
  const lastSeq = logs.at(-1)?.seq ?? -1;

  const filter = useMemo(
    () => ({ levels, search, pausedAt, clearedThrough }),
    [levels, search, pausedAt, clearedThrough],
  );
  const shown = useMemo(() => filterLogs(logs, filter), [logs, filter]);
  const { byLevel, total, waiting } = useMemo(() => tallyLogs(logs, filter), [logs, filter]);
  const rows = useMemo(() => withRunSeparators(shown), [shown]);
  const offsets = useMemo(() => rowOffsets(rows.map(rowHeight)), [rows]);
  const view = visibleWindow(offsets, scrollTop, viewportHeight);

  useEffect(() => {
    const element = viewport.current;

    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = viewport.current;

    if (stick.current && element) element.scrollTop = element.scrollHeight;
  }, [rows.length]);

  const toggleLevel = (level: LogLevel) => {
    const next = new Set(levels);

    if (next.has(level)) {
      next.delete(level);
    } else {
      next.add(level);
    }

    setLevels(next);
  };

  const runLabel = (gen: number) => {
    const run = runs.find((candidate) => candidate.gen === gen);

    return `Run ${gen}${run ? ` · ${causeText(run.cause)}` : ''}`;
  };

  return (
    <Card className="logs" aria-labelledby="log-title">
      <div className="log-tools">
        <h2 id="log-title" className="section-title">
          Output
        </h2>
        <SegmentedControl
          label="Log levels"
          options={LEVEL_ORDER.map((level) => ({ id: level, label: LEVEL_LABELS[level], count: byLevel[level] }))}
          pressed={levels}
          onToggle={toggleLevel}
        />
        <SearchField label="Filter output" value={search} onChange={setSearch} className="log-search" />
        <div className="log-actions">
          <span className="muted log-count" aria-live="polite">
            {shown.length} of {total} lines
          </span>
          <IconButton
            icon={pausedAt === null ? 'pause' : 'play'}
            aria-pressed={pausedAt !== null}
            onClick={() => setPausedAt(pausedAt === null ? lastSeq : null)}
          >
            {pausedAt === null ? 'Pause' : `Resume${waiting > 0 ? ` (${waiting} new)` : ''}`}
          </IconButton>
          <IconButton icon="clear" onClick={() => setClearedThrough(pausedAt ?? lastSeq)}>
            Clear
          </IconButton>
        </div>
      </div>
      <div
        ref={viewport}
        className="log-body"
        role="log"
        aria-live="off"
        aria-label="App output"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;

          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_DISTANCE;
          setScrollTop(element.scrollTop);
        }}
      >
        <div style={{ height: view.totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${view.offsetTop}px)` }}>
            {rows.slice(view.start, view.end).map((row) =>
              row.kind === 'run' ? (
                <div key={row.key} className="log-row sep" style={{ height: RUN_ROW_HEIGHT }}>
                  <span>{runLabel(row.gen)}</span>
                </div>
              ) : (
                <div
                  key={row.entry.seq}
                  className="log-row"
                  data-level={row.entry.level}
                  data-stream={row.entry.stream}
                  style={{ height: rowHeight(row) }}
                  title={stripAnsi(row.entry.line)}
                >
                  <span className="ts">{formatClock(row.entry.at)}</span>
                  <span className="g" title={`Run ${row.entry.gen}`}>
                    #{row.entry.gen}
                  </span>
                  <span className={`lv lv-${row.entry.level}`}>{row.entry.level}</span>
                  <span className="text">{row.entry.text}</span>
                </div>
              ),
            )}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="log-empty muted">{total === 0 ? 'No output yet.' : 'No line matches the filter.'}</p>
        ) : null}
      </div>
    </Card>
  );
};
