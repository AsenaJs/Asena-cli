import { useId } from 'react';
import type { ConsoleRun } from '../../lib/console/hostProtocol';
import type { DevtoolsMetrics, DevtoolsTransport } from '../../lib/console/protocol';
import { runStatus } from '../shell/status';
import type { ConsoleState } from '../state/store';
import { Card, Pill } from '../ui/components';
import { formatBytes, formatElapsed, formatMs, formatPercent, quantile, sparkline, splitUnit } from './format';
import { LogView } from './LogView';
import { causeText, exitText } from './runs';

const SPARK_WIDTH = 260;

const SPARK_HEIGHT = 46;

// Older runs fold into a count so the timeline stays one line.
const TIMELINE_RUNS = 6;

const transportsOf = (state: ConsoleState): DevtoolsTransport[] =>
  state.metrics.at(-1)?.transports ?? state.hello?.transports ?? [];

/** The health card's second line: the lifecycle and what readiness waits for. */
export const healthDetail = (state: ConsoleState): string => {
  const { child } = state;
  const readiness = state.metrics.at(-1)?.readiness;

  if (!child) return 'No app process yet';
  if (child.state === 'exited' && child.endedBy !== 'restart') {
    return 'The output below is kept; save a file or press Restart to run it again.';
  }
  if (child.unattached) {
    return 'The agent attaches when AsenaServer.start() has finished, and not at all when the app runs with NODE_ENV=production. The output below is live.';
  }
  if (child.state !== 'running') return 'Waiting for the app to report';
  if (!readiness) return 'Waiting for the first sample';
  if (readiness.status === 'not_ready') return `Lifecycle ${readiness.state}`;

  const transports = transportsOf(state);

  if (transports.length === 0) return 'Lifecycle STARTED · no transports to wait for';

  return `Lifecycle STARTED · ${transports
    .map((transport) => `${transport.name} ${transport.connected ? 'connected' : 'disconnected'}`)
    .join(', ')}`;
};

/** What the agent left out since it attached, or `null` when it sent everything. */
const droppedNote = (metrics: DevtoolsMetrics[]): string | null => {
  const dropped = metrics.at(-1)?.dropped ?? 0;

  return dropped > 0
    ? `Dropped while the console host was not reading: ${dropped} (request records and samples)`
    : null;
};

const HealthCard = ({ state }: { state: ConsoleState }) => {
  const status = runStatus(state);
  const dropped = droppedNote(state.metrics);

  return (
    <Card className="health-card">
      <Pill tone={status.tone} dot>
        {status.label}
      </Pill>
      <div>
        <div className="big">{status.detail}</div>
        <div className="muted health-sub">{healthDetail(state)}</div>
        {dropped ? <div className="muted health-sub">{dropped}</div> : null}
      </div>
    </Card>
  );
};

export const RunTimeline = ({ runs }: { runs: ConsoleRun[] }) => {
  const origin = runs[0]?.startedAt ?? 0;
  const shown = runs.slice(-TIMELINE_RUNS);
  const folded = runs.length - shown.length;

  return (
    <Card className="timeline">
      <div className="timeline-title">Restarts this session</div>
      {runs.length === 0 ? (
        <p className="muted timeline-empty">No run yet.</p>
      ) : (
        <ol className="gens" aria-label="Runs">
          {folded > 0 ? <li className="arrow">{folded} earlier →</li> : null}
          {shown.map((run, index) => {
            const current = index === shown.length - 1;
            const exit = exitText(run);

            return (
              <li key={run.gen} className="gen-item">
                {index > 0 ? (
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
                <span className={current ? 'gen current' : 'gen'} title={causeText(run.cause)}>
                  Run {run.gen} · {formatElapsed(run.startedAt - origin)}
                  {current && run.cause.kind !== 'start' ? ` · ${causeText(run.cause)}` : ''}
                  {exit ? <span className="x">{exit}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};

interface MetricProps {
  label: string;
  values: number[];
  format: (value: number) => string;
  note: string | null;
}

export const Metric = ({ label, values, format, note }: MetricProps) => {
  const gradient = `spark-${useId().replace(/:/g, '')}`;
  const latest = values.at(-1);
  const [value, unit] = latest === undefined ? ['–', ''] : splitUnit(format(latest));
  const spark = sparkline(values, SPARK_WIDTH, SPARK_HEIGHT);
  const summary =
    latest === undefined
      ? `${label}: no samples`
      : `${label}: ${format(latest)}, min ${format(Math.min(...values))}, max ${format(Math.max(...values))} over ${values.length} samples`;

  return (
    <Card className="metric">
      <div className="label">
        {label}
        <span className="delta">{values.length > 0 ? `last ${values.length} s` : 'no samples'}</span>
      </div>
      <div className="value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      <svg role="img" aria-label={summary} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ink-3)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--ink-3)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {spark.last ? (
          <>
            <path d={spark.area} fill={`url(#${gradient})`} />
            <path d={spark.line} className="spark-line" vectorEffect="non-scaling-stroke" />
            <circle cx={spark.last.x} cy={spark.last.y} r="3" className="spark-dot" />
          </>
        ) : null}
      </svg>
      <div className="delta">{note ?? ' '}</div>
    </Card>
  );
};

const pick = (metrics: DevtoolsMetrics[], key: 'rss' | 'heapUsed' | 'cpuPercent' | 'eventLoopLagMs') =>
  metrics.map((sample) => sample[key]);

const rssNote = (values: number[]): string | null => {
  const first = values[0];
  const last = values.at(-1);

  if (first === undefined || last === undefined || values.length < 2) return null;

  const change = last - first;

  return `${change >= 0 ? '+' : '−'}${formatBytes(Math.abs(change))} in ${values.length} s`;
};

export const RuntimePanel = ({ state }: { state: ConsoleState }) => {
  const { metrics } = state;
  const latest = metrics.at(-1);
  const cpu = pick(metrics, 'cpuPercent');
  const lag = pick(metrics, 'eventLoopLagMs');

  return (
    <section className="runtime" aria-label="Runtime">
      <div className="health">
        <HealthCard state={state} />
        <RunTimeline runs={state.runs} />
      </div>
      <div className="summary">
        <Metric
          label="Memory (RSS)"
          values={pick(metrics, 'rss')}
          format={formatBytes}
          note={rssNote(pick(metrics, 'rss'))}
        />
        <Metric
          label="Heap used"
          values={pick(metrics, 'heapUsed')}
          format={formatBytes}
          note={latest ? `of ${formatBytes(latest.heapTotal)}` : null}
        />
        <Metric
          label="CPU"
          values={cpu}
          format={formatPercent}
          note={cpu.length > 0 ? `peak ${formatPercent(Math.max(...cpu))}` : null}
        />
        <Metric
          label="Event-loop lag"
          values={lag}
          format={formatMs}
          note={lag.length > 0 ? `p95 ${formatMs(quantile(lag, 0.95))}` : null}
        />
      </div>
      <LogView logs={state.logs} runs={state.runs} />
    </section>
  );
};
