import { type ReactNode, useState } from 'react';
import type {
  DevtoolsCommand,
  DevtoolsCommandRequest,
  DevtoolsCommandResult,
  DevtoolsHello,
  DevtoolsMetrics,
  DevtoolsRequestRecord,
  DevtoolsSnapshot,
} from '../../lib/console/protocol';
import { highlightJson } from '../endpoints/highlight';
import { formatClock, formatMs } from '../runtime/format';
import { Card, IconButton, Pill, SectionHead } from '../ui/components';
import { Icon } from '../ui/icons';
import {
  eventCommand,
  formatNextRun,
  groupBy,
  isPattern,
  lastDispatch,
  messageCommand,
  nextCommandId,
  parsePayload,
  resultText,
  scheduleCommand,
  transportStates,
} from './commands';
import { nextRunOf } from './cron';

/** Sends one command to the app; `false` when it could not go out. */
export type SendCommand = (command: DevtoolsCommandRequest) => boolean;

export interface MessagingPanelProps {
  snapshot: DevtoolsSnapshot;
  hello: DevtoolsHello | null;
  metrics: DevtoolsMetrics[];
  requests: DevtoolsRequestRecord[];
  commandResults: Record<string, DevtoolsCommandResult>;
  /** `null` while commands cannot be sent; `blockedReason` says why. */
  send: SendCommand | null;
  blockedReason: string | null;
  /** The app's time zone, which its cron schedules run in. */
  timeZone: string;
  /** Server names by id when the app has several, so each result says which one answered. */
  serverLabels?: ServerLabels;
  now?: Date;
}

export type ServerLabels = Record<string, string>;

type Phase = 'idle' | 'editing' | 'confirming';

interface CommandItemProps {
  id: string;
  head: ReactNode;
  /** The button that starts the action: Run now, Emit, Send. */
  verb: string;
  /** Whether the action takes a JSON payload. */
  payload: boolean;
  /** An editable event name, for emits. */
  name?: string;
  confirmText: (name: string) => string;
  build: (name: string, data: unknown) => DevtoolsCommand;
  send: SendCommand | null;
  results: Record<string, DevtoolsCommandResult>;
  serverLabels?: ServerLabels;
}

/** A result without a server id is one no server answered: the host's own, or for a server that was gone. */
const answeredBy = (result: DevtoolsCommandResult, labels: ServerLabels): string =>
  result.serverId === undefined ? 'no server answered' : `answered by ${labels[result.serverId] ?? result.serverId}`;

export const ResultView = ({
  result,
  serverLabels,
}: {
  result: DevtoolsCommandResult | undefined;
  serverLabels?: ServerLabels;
}) => {
  if (!result) {
    return (
      <p className="muted pane-note" role="status">
        Waiting for the app to answer…
      </p>
    );
  }

  const who = serverLabels ? <span className="muted">{answeredBy(result, serverLabels)}</span> : null;

  if (!result.ok) {
    return (
      <p className="notice bad" role="alert">
        <b>{result.error.name}</b> {result.error.message} {who}
      </p>
    );
  }

  const text = resultText(result);

  return (
    <div className="cmd-result" role="status">
      <Pill tone="ok" dot>
        Done
      </Pill>
      {who}
      {text === null ? (
        <span className="muted">no result</span>
      ) : (
        <pre className="code" aria-label="Result">
          {highlightJson(text)}
        </pre>
      )}
    </div>
  );
};

/** One schedule, event or handler with its action: optional payload editor, inline confirm, then the result. */
export const CommandItem = ({
  id,
  head,
  verb,
  payload,
  name: initialName,
  confirmText,
  build,
  send,
  results,
  serverLabels,
}: CommandItemProps) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [text, setText] = useState('');
  const [name, setName] = useState(initialName ?? '');
  const [sentId, setSentId] = useState<string | null>(null);
  const [notSent, setNotSent] = useState(false);
  const parsed = parsePayload(text);
  const nameProblem =
    initialName === undefined
      ? null
      : name.trim() === ''
        ? 'Name an event.'
        : isPattern(name)
          ? 'Name a concrete event, not a pattern.'
          : null;
  const ready = parsed.ok && nameProblem === null;

  const confirm = () => {
    if (!send || !parsed.ok) return;

    const commandId = nextCommandId();
    const went = send({ id: commandId, ...build(name.trim(), parsed.data) });

    setPhase('idle');
    setNotSent(!went);
    setSentId(went ? commandId : null);
  };

  return (
    <li className="cmd-item">
      <div className="cmd-head">
        {head}
        <IconButton
          icon="play"
          disabled={!send || phase !== 'idle'}
          aria-expanded={payload ? phase !== 'idle' : undefined}
          onClick={() => setPhase(payload ? 'editing' : 'confirming')}
        >
          {verb}
        </IconButton>
      </div>
      {payload && phase !== 'idle' ? (
        <div className="cmd-editor">
          {initialName === undefined ? null : (
            <label className="cmd-field">
              <span>Event</span>
              <input
                className="input"
                spellCheck={false}
                value={name}
                disabled={phase === 'confirming'}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label className="cmd-field">
            <span>Payload (JSON, optional)</span>
            <textarea
              className="textarea"
              spellCheck={false}
              rows={4}
              value={text}
              placeholder='{ "id": "12" }'
              disabled={phase === 'confirming'}
              aria-describedby={`${id}-payload-error`}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div id={`${id}-payload-error`}>
            {parsed.ok ? null : <p className="field-error">Not valid JSON: {parsed.error}</p>}
            {nameProblem ? <p className="field-error">{nameProblem}</p> : null}
          </div>
          {phase === 'editing' ? (
            <div className="cmd-buttons">
              <button type="button" className="icon-btn" disabled={!ready} onClick={() => setPhase('confirming')}>
                {verb}…
              </button>
              <button type="button" className="link-btn quiet" onClick={() => setPhase('idle')}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {phase === 'confirming' ? (
        <div className="cmd-confirm" role="group" aria-label="Confirm">
          <span>{confirmText(name.trim())}</span>
          <button type="button" className="send" disabled={!send || !ready} onClick={confirm}>
            Confirm
          </button>
          <button type="button" className="link-btn quiet" onClick={() => setPhase(payload ? 'editing' : 'idle')}>
            Cancel
          </button>
        </div>
      ) : null}
      {notSent ? (
        <p className="notice bad" role="alert">
          Not connected to the console host; nothing was sent.
        </p>
      ) : null}
      {sentId ? <ResultView result={results[sentId]} serverLabels={serverLabels} /> : null}
    </li>
  );
};

const handlerName = (component: string, method: string) => (
  <span className="mono muted">
    {component}.{method}
  </span>
);

const Section = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
  <Card className="msg-section" aria-label={title}>
    <SectionHead title={title} count={count} />
    {children}
  </Card>
);

const LastRun = ({ record }: { record: DevtoolsRequestRecord | null }) =>
  record ? (
    <span className="cmd-last">
      <span className={`st ${record.status >= 500 ? 'st-5' : 'st-2'}`}>{record.status >= 500 ? 'failed' : 'ok'}</span>{' '}
      <span className="muted">
        at {formatClock(record.startedAt).slice(0, 8)} in {formatMs(record.durationMs)}
      </span>
    </span>
  ) : (
    <span className="cmd-last muted">not run this session</span>
  );

export const MessagingPanel = ({
  snapshot,
  hello,
  metrics,
  requests,
  commandResults,
  send,
  blockedReason,
  timeZone,
  serverLabels,
  now = new Date(),
}: MessagingPanelProps) => {
  const transports = transportStates(hello, metrics);
  const handlersByTransport = groupBy(snapshot.messageHandlers, (handler) => handler.transport);
  const events = groupBy(snapshot.events, (handler) => handler.event);

  if (snapshot.schedules.length === 0 && snapshot.events.length === 0 && snapshot.messageHandlers.length === 0) {
    return (
      <Card className="empty" aria-labelledby="messaging-empty-title">
        <span className="empty-icon">
          <Icon name="messaging" />
        </span>
        <h2 id="messaging-empty-title">Nothing to run</h2>
        <p>The app declares no @Schedule, no @On handler and no @MessagePattern or @EventPattern handler.</p>
      </Card>
    );
  }

  return (
    <div className="messaging">
      {blockedReason ? (
        <p className="notice" role="note">
          {blockedReason}
        </p>
      ) : null}
      {snapshot.schedules.length > 0 ? (
        <Section title="Schedules" count={snapshot.schedules.length}>
          <ul className="cmd-list">
            {snapshot.schedules.map((schedule) => {
              const next = nextRunOf(schedule.cron, now, timeZone);

              return (
                <CommandItem
                  key={schedule.name}
                  id={`schedule-${schedule.name}`}
                  head={
                    <div className="cmd-info">
                      <span className="cmd-name">{schedule.name}</span>
                      <span className="mono cmd-meta">{schedule.cron}</span>
                      <span className="cmd-meta">
                        {next.ok
                          ? next.at
                            ? `next ${formatNextRun(next.at, now, timeZone)}`
                            : 'never runs'
                          : `cron not understood: ${next.error}`}
                      </span>
                      <LastRun record={lastDispatch(requests, '@Schedule', schedule.name)} />
                    </div>
                  }
                  verb="Run now"
                  payload={false}
                  confirmText={() => `Run ${schedule.name} now, in the running app? Its schedule stays as it is.`}
                  build={() => scheduleCommand(schedule.name)}
                  send={send}
                  results={commandResults}
                  serverLabels={serverLabels}
                />
              );
            })}
          </ul>
        </Section>
      ) : null}
      {events.length > 0 ? (
        <Section title="Events" count={snapshot.events.length}>
          <ul className="cmd-list">
            {events.map(([event, handlers]) => (
              <CommandItem
                key={event}
                id={`event-${event}`}
                head={
                  <div className="cmd-info">
                    <span className="mono cmd-name">{event}</span>
                    <span className="cmd-meta">
                      {handlers.map((handler) => (
                        <span key={`${handler.component}.${handler.method}`}>
                          {handlerName(handler.component, handler.method)}{' '}
                        </span>
                      ))}
                    </span>
                  </div>
                }
                verb="Emit"
                payload
                name={event}
                confirmText={(name) => `Emit ${name} in the running app? Every @On handler that matches it runs.`}
                build={eventCommand}
                send={send}
                results={commandResults}
                serverLabels={serverLabels}
              />
            ))}
          </ul>
        </Section>
      ) : null}
      {handlersByTransport.map(([transport, handlers]) => {
        const state = transports.find((candidate) => candidate.name === transport);

        return (
          <Section key={transport} title={`Messages · ${transport}`} count={handlers.length}>
            <div className="msg-transport">
              {state ? (
                <Pill tone={state.connected ? 'ok' : 'bad'} dot>
                  {state.connected ? 'connected' : 'disconnected'}
                </Pill>
              ) : (
                <Pill tone="neutral">state unknown</Pill>
              )}
            </div>
            <ul className="cmd-list">
              {handlers.map((handler) => (
                <CommandItem
                  key={`${handler.kind}:${handler.pattern}`}
                  id={`message-${transport}-${handler.pattern}`}
                  head={
                    <div className="cmd-info">
                      <span className="mono cmd-name">{handler.pattern}</span>
                      <span className="tag">{handler.kind === 'message' ? '@MessagePattern' : '@EventPattern'}</span>
                      <span className="cmd-meta">{handlerName(handler.controller, handler.method)}</span>
                    </div>
                  }
                  verb="Send"
                  payload
                  confirmText={() =>
                    handler.kind === 'message'
                      ? `Send ${handler.pattern} over ${transport} and wait for the reply?`
                      : `Publish ${handler.pattern} over ${transport}? Every subscriber receives it.`
                  }
                  build={(_name, data) => messageCommand(handler, data)}
                  send={send}
                  results={commandResults}
                  serverLabels={serverLabels}
                />
              ))}
            </ul>
          </Section>
        );
      })}
    </div>
  );
};
