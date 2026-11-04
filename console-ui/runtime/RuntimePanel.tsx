import type { DevtoolsMetrics, DevtoolsReadiness, DevtoolsTransport } from '../../lib/console/protocol';
import type { ConsoleState } from '../state/store';
import { formatBytes, formatMs, formatPercent, formatUptime, sparklinePoints } from './format';
import { LogView } from './LogView';

const SPARK_WIDTH = 160;

const SPARK_HEIGHT = 36;

const readinessView = (readiness: DevtoolsReadiness): { tone: string; label: string } => {
  if (readiness.status === 'not_ready') return { tone: 'error', label: `Not ready (${readiness.state})` };
  if (readiness.status === 'degraded') return { tone: 'warn', label: 'Degraded' };

  return { tone: 'ok', label: 'Up' };
};

export const ReadinessBadge = ({ readiness }: { readiness: DevtoolsReadiness | undefined }) => {
  if (!readiness)
    return (
      <span className="badge" data-tone="idle">
        No samples yet
      </span>
    );

  const { tone, label } = readinessView(readiness);
  const transports = 'transports' in readiness ? Object.entries(readiness.transports) : [];

  return (
    <div className="readiness">
      <span className="badge" data-tone={tone}>
        {label}
      </span>
      {transports.length > 0 ? (
        <ul className="plain-list transport-list" aria-label="Transports">
          {transports.map(([name, status]) => (
            <li key={name} data-tone={status === 'connected' ? 'ok' : 'error'}>
              <span className="status-dot" aria-hidden="true" />
              {name}: {status}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

interface MetricProps {
  label: string;
  values: number[];
  format: (value: number) => string;
  detail?: string;
}

export const Metric = ({ label, values, format, detail }: MetricProps) => {
  const latest = values.at(-1);
  const summary =
    latest === undefined
      ? `${label}: no samples`
      : `${label}: ${format(latest)}, min ${format(Math.min(...values))}, max ${format(Math.max(...values))} over ${values.length} samples`;

  return (
    <figure className="metric">
      <figcaption>
        <span className="metric-label">{label}</span>
        <span className="metric-value">{latest === undefined ? '–' : format(latest)}</span>
        {detail ? <span className="muted metric-detail">{detail}</span> : null}
      </figcaption>
      <svg
        className="sparkline"
        role="img"
        aria-label={summary}
        width={SPARK_WIDTH}
        height={SPARK_HEIGHT}
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <polyline points={sparklinePoints(values, SPARK_WIDTH, SPARK_HEIGHT)} />
      </svg>
    </figure>
  );
};

const pick = (metrics: DevtoolsMetrics[], key: 'rss' | 'heapUsed' | 'cpuPercent' | 'eventLoopLagMs') =>
  metrics.map((sample) => sample[key]);

export const RuntimePanel = ({ state }: { state: ConsoleState }) => {
  const { metrics } = state;
  const latest = metrics.at(-1);
  const transports: DevtoolsTransport[] = latest?.transports ?? state.hello?.transports ?? [];

  return (
    <section className="panel runtime-panel" aria-labelledby="runtime-title">
      <h2 id="runtime-title">Runtime</h2>
      <div className="runtime-summary">
        <div>
          <span className="metric-label">Readiness</span>
          <ReadinessBadge readiness={latest?.readiness} />
        </div>
        <div>
          <span className="metric-label">Uptime</span>
          <span className="metric-value">{latest ? formatUptime(latest.uptimeSeconds) : '–'}</span>
        </div>
        {transports.length > 0 && !(latest && 'transports' in latest.readiness) ? (
          <div>
            <span className="metric-label">Transports</span>
            <ul className="plain-list transport-list">
              {transports.map((transport) => (
                <li key={transport.name} data-tone={transport.connected ? 'ok' : 'error'}>
                  <span className="status-dot" aria-hidden="true" />
                  {transport.name}: {transport.connected ? 'connected' : 'disconnected'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="metric-grid">
        <Metric label="RSS" values={pick(metrics, 'rss')} format={formatBytes} />
        <Metric
          label="Heap used"
          values={pick(metrics, 'heapUsed')}
          format={formatBytes}
          {...(latest ? { detail: `of ${formatBytes(latest.heapTotal)}` } : {})}
        />
        <Metric label="CPU" values={pick(metrics, 'cpuPercent')} format={formatPercent} />
        <Metric label="Event-loop lag" values={pick(metrics, 'eventLoopLagMs')} format={formatMs} />
      </div>
      <LogView logs={state.logs} />
    </section>
  );
};
