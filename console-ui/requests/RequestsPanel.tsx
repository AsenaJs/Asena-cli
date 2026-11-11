import { type KeyboardEvent, useMemo, useState } from 'react';
import type { ConsoleRequestRecord, ConsoleRun } from '../../lib/console/hostProtocol';
import type { DevtoolsRoute } from '../../lib/console/protocol';
import { answerTone, STATUS_TEXT, statusTone } from '../endpoints/RouteTester';
import { formatClock, formatMs } from '../runtime/format';
import { shownLog } from '../runtime/logs';
import type { ServerOption } from '../shell/status';
import { Card, IconButton, MethodBadge, Pill, SearchField, Section, SegmentedControl } from '../ui/components';
import { Icon } from '../ui/icons';
import {
  countByClass,
  type EndpointFocus,
  filterRequests,
  isAnswer,
  isDispatch,
  methodsOf,
  replayFocus,
  runOfRecord,
  STEP_LABELS,
  statusClass,
} from './records';

export interface RequestsPanelProps {
  requests: ConsoleRequestRecord[];
  runs: ConsoleRun[];
  /** The routes of the server on screen, to find the one a request can be replayed on; empty before its snapshot. */
  routes: DevtoolsRoute[];
  onReplay: (focus: EndpointFocus) => void;
  /** The app's servers when it has several: the list can then be narrowed to one, and each record names its own. */
  servers?: ServerOption[];
  /** The id of the server on screen, whose routes `routes` are. */
  viewedServer?: string | null;
  /** The record to open first. */
  initialSelected?: string | null;
}

const RequestDetails = ({
  record,
  runs,
  routes,
  server,
  onReplay,
  onClose,
}: {
  record: ConsoleRequestRecord;
  runs: ConsoleRun[];
  routes: DevtoolsRoute[];
  /** The record's server among several, and whether the routes on screen are another server's. */
  server: { label: string; elsewhere: boolean } | null;
  onReplay: (focus: EndpointFocus) => void;
  onClose: () => void;
}) => {
  const run = runOfRecord(record, runs);
  const logs = (record.logs ?? []).flatMap((entry) => {
    const log = shownLog(entry.text, entry.stream);

    return log ? [{ ...entry, ...log }] : [];
  });
  const focus = server?.elsewhere ? null : replayFocus(record, routes);
  const dispatch = isDispatch(record);
  const noReplay = dispatch
    ? `A ${record.method} dispatch, not an HTTP request: run it again from Messaging.`
    : server?.elsewhere
      ? `Served by ${server.label}: pick that server in the sidebar to replay it.`
      : `No route of the app serves ${record.method} ${record.path}, so there is nothing to replay.`;

  return (
    <Card className="rq-drawer" role="region" aria-labelledby="rq-drawer-title">
      <div className="rq-drawer-head">
        <MethodBadge method={record.method} />
        <h2 id="rq-drawer-title" className="mono">
          {record.path}
        </h2>
        <IconButton icon="close" aria-label="Close the request details" onClick={onClose} />
      </div>
      <div className="resp-meta">
        <Pill tone={statusTone(record.status)} dot>
          {record.status}
          {!dispatch && STATUS_TEXT[record.status] ? ` ${STATUS_TEXT[record.status]}` : ''}
          {dispatch ? (record.status >= 500 ? ' failed' : ' settled') : ''}
        </Pill>
        <span>
          Time <b>{formatMs(record.durationMs)}</b>
        </span>
        <span>
          At <b>{formatClock(record.startedAt)}</b>
        </span>
        {server ? <span>{server.label}</span> : null}
        {run === null ? null : <span className="muted resp-run">Run {run}</span>}
      </div>
      <div className="rq-drawer-body">
        <Section title="Chain">
          <ol className="steps">
            {record.steps.map((step, index) => {
              const answered = isAnswer(step, record);

              return (
                <li key={`${step.kind}:${step.name}:${index}`} className={answered ? 'answered' : undefined}>
                  <span className="step-kind">{STEP_LABELS[step.kind]}</span>
                  <span className="mono step-name">{step.name}</span>
                  {answered ? (
                    <Pill tone={answerTone(step) === 'ok' ? 'ok' : 'bad'} className="step-answer">
                      answered
                    </Pill>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Section>
        <Section title={`Output during the request${logs.length > 0 ? ` (${logs.length})` : ''}`}>
          {logs.length > 0 ? (
            <ol className="rq-logs" aria-label="Output written during the request">
              {logs.map((entry, index) => (
                <li key={index} className="rq-log" data-stream={entry.stream}>
                  <span className="ts">{formatClock(entry.at)}</span>
                  <span className={`lv lv-${entry.level}`}>{entry.level}</span>
                  <pre className="rq-log-text">{entry.text.replace(/\r?\n$/, '')}</pre>
                  {entry.stream === 'stderr' ? <span className="rq-stream">stderr</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted pane-note">No output during this request.</p>
          )}
          {record.logsTruncated ? (
            <p className="muted pane-note">Output truncated: the agent keeps the first lines of a request only.</p>
          ) : null}
        </Section>
        <div className="rq-actions">
          {focus ? (
            <button type="button" className="link-btn" onClick={() => onReplay(focus)}>
              Replay in Endpoints →
            </button>
          ) : (
            <p className="muted pane-note">{noReplay}</p>
          )}
        </div>
      </div>
    </Card>
  );
};

export const RequestsPanel = ({
  requests,
  runs,
  routes,
  onReplay,
  servers = [],
  viewedServer = null,
  initialSelected = null,
}: RequestsPanelProps) => {
  const [hiddenClasses, setHiddenClasses] = useState<ReadonlySet<string>>(() => new Set());
  const [method, setMethod] = useState('');
  const [serverId, setServerId] = useState('');
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const several = servers.length > 1;
  const shown = useMemo(
    () => filterRequests(requests, { hiddenClasses, method, text, serverId: several ? serverId : '' }),
    [requests, hiddenClasses, method, text, serverId, several],
  );
  const counts = useMemo(() => countByClass(requests), [requests]);
  const methods = useMemo(() => methodsOf(requests), [requests]);
  const selected = requests.find((record) => record.id === selectedId) ?? null;
  const serverOf = (record: ConsoleRequestRecord) =>
    several
      ? {
          label: servers.find((server) => server.serverId === record.serverId)?.label ?? record.serverId,
          elsewhere: record.serverId !== viewedServer,
        }
      : null;

  const toggleClass = (name: string) => {
    const next = new Set(hiddenClasses);

    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }

    setHiddenClasses(next);
  };

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedId(id);
    }
  };

  if (requests.length === 0) {
    return (
      <Card className="empty" aria-labelledby="requests-empty-title">
        <span className="empty-icon">
          <Icon name="requests" />
        </span>
        <h2 id="requests-empty-title">No requests yet</h2>
        <p>Every request the app serves appears here with the chain that answered it, newest first.</p>
        <p className="muted">Send one from Endpoints, or call the app from anywhere else.</p>
      </Card>
    );
  }

  return (
    <div className={selected ? 'rq-layout open' : 'rq-layout'}>
      <Card className="rq-list">
        <div className="toolbar">
          <SegmentedControl
            label="Status"
            options={[...counts].map(([name, count]) => ({ id: name, label: name, count }))}
            pressed={new Set([...counts.keys()].filter((name) => !hiddenClasses.has(name)))}
            onToggle={toggleClass}
          />
          <select
            className="select toolbar-select"
            aria-label="Method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="">All methods</option>
            {methods.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {several ? (
            <select
              className="select toolbar-select"
              aria-label="Server"
              value={serverId}
              onChange={(event) => setServerId(event.target.value)}
            >
              <option value="">All servers</option>
              {servers.map((server) => (
                <option key={server.serverId} value={server.serverId}>
                  {server.label}
                </option>
              ))}
            </select>
          ) : null}
          <SearchField label="Filter by path, handler or status" value={text} onChange={setText} />
          <span className="muted toolbar-count num">
            {shown.length === requests.length ? `${requests.length}` : `${shown.length} of ${requests.length}`}
          </span>
        </div>
        <div className="table-wrap">
          <table className="table rq-table">
            <caption className="visually-hidden">Requests, newest first</caption>
            <colgroup>
              <col className="c-time" />
              <col className="c-method" />
              <col />
              <col className="c-status" />
              <col className="c-duration" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Method</th>
                <th scope="col">Path</th>
                <th scope="col">Status</th>
                <th scope="col" className="right">
                  Duration
                </th>
                <th scope="col">Answered by</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((record) => (
                <tr
                  key={record.id}
                  tabIndex={0}
                  aria-current={record.id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(record.id)}
                  onKeyDown={(event) => onRowKey(event, record.id)}
                >
                  <td className="mono muted num" title={formatClock(record.startedAt)}>
                    {formatClock(record.startedAt).slice(0, 8)}
                  </td>
                  <td>
                    <MethodBadge method={record.method} />
                  </td>
                  <td className="mono cell-path">{record.path}</td>
                  <td className={`mono num st st-${statusClass(record.status)[0]}`}>{record.status}</td>
                  <td className="num right">{formatMs(record.durationMs)}</td>
                  <td className="mono cell-answer" title={record.answeredBy.name}>
                    <span className="muted">{STEP_LABELS[record.answeredBy.kind]}</span> {record.answeredBy.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 ? <p className="muted pane-note table-note">No request matches the filters.</p> : null}
        </div>
      </Card>
      {selected ? (
        <RequestDetails
          key={selected.id}
          record={selected}
          runs={runs}
          routes={routes}
          server={serverOf(selected)}
          onReplay={onReplay}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
};
