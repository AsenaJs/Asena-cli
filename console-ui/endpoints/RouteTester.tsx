import { useState } from 'react';
import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import type { DevtoolsRoute } from '../../lib/console/protocol';
import { formatClock } from '../runtime/format';
import type { HistoryEntry } from './history';
import type { HttpOutcome } from './http';
import {
  ALL_METHOD_CHOICES,
  buildRequest,
  draftFor,
  jsonProblem,
  type KeyValue,
  methodHasBody,
  pathParams,
  prettyBody,
  repeatedKeys,
  type RequestDraft,
  requestUrl,
} from './requestBuilder';

const statusTone = (status: number): string => {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  if (status >= 200 && status < 300) return 'ok';

  return 'idle';
};

const KeyValueEditor = ({
  legend,
  rows,
  onChange,
}: {
  legend: string;
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
}) => {
  const repeated = repeatedKeys(rows);
  const update = (index: number, patch: Partial<KeyValue>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <fieldset className="kv-editor">
      <legend>{legend}</legend>
      {rows.map((row, index) => (
        <div key={index} className="kv-row">
          <input
            aria-label={`${legend} name ${index + 1}`}
            placeholder="name"
            value={row.key}
            onChange={(event) => update(index, { key: event.target.value })}
          />
          <input
            aria-label={`${legend} value ${index + 1}`}
            placeholder="value"
            value={row.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button
            type="button"
            aria-label={`Remove ${legend.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        Add {legend.toLowerCase()}
      </button>
      {repeated.length > 0 ? (
        <p className="field-error">Repeated: {repeated.join(', ')}. Only the last value of each is sent.</p>
      ) : null}
    </fieldset>
  );
};

export const ResponseView = ({ outcome, truncated }: { outcome: HttpOutcome; truncated?: boolean }) => {
  if (!outcome.ok) {
    return (
      <div className="response response-error" role="alert">
        {outcome.reason}
      </div>
    );
  }

  const { response } = outcome;

  return (
    <div className="response">
      <div className="response-summary">
        <span className="badge" data-tone={statusTone(response.status)}>
          {response.status}
        </span>
        <span className="muted">{response.durationMs.toFixed(1)} ms</span>
      </div>
      <details>
        <summary>Headers ({Object.keys(response.headers).length})</summary>
        <table className="data-table">
          <tbody>
            {Object.entries(response.headers).map(([name, value]) => (
              <tr key={name}>
                <th scope="row" className="mono">
                  {name}
                </th>
                <td className="mono">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <pre className="response-body" tabIndex={0} aria-label="Response body">
        {response.body === '' ? '(empty body)' : prettyBody(response.body)}
      </pre>
      {truncated ? <p className="muted">The stored body was cut to keep the history small.</p> : null}
    </div>
  );
};

export interface RouteTesterProps {
  route: DevtoolsRoute;
  history: HistoryEntry[];
  /** `null` when requests cannot be sent; the reason is shown instead. */
  send: ((request: ConsoleHttpRequest) => Promise<HttpOutcome>) | null;
  blockedReason: string | null;
  onRecord: (entry: HistoryEntry) => void;
  onClearHistory: () => void;
}

export const RouteTester = ({ route, history, send, blockedReason, onRecord, onClearHistory }: RouteTesterProps) => {
  const [draft, setDraft] = useState<RequestDraft>(() => draftFor(route));
  const [sending, setSending] = useState(false);
  const [shown, setShown] = useState<{ outcome: HttpOutcome; truncated: boolean } | null>(null);
  const params = pathParams(route.path);
  const built = buildRequest(route, draft);
  const method = route.httpMethod === 'ALL' ? draft.method : route.httpMethod;
  const bodyAllowed = methodHasBody(method);
  const bodyProblem = bodyAllowed ? jsonProblem(draft.body) : null;

  const submit = async () => {
    if (!built.ok || !send) return;

    setSending(true);

    const outcome = await send(built.request);

    setSending(false);
    setShown({ outcome, truncated: false });
    onRecord({ at: Date.now(), draft, request: built.request, outcome });
  };

  return (
    <section className="route-tester" aria-labelledby="route-title">
      <h3 id="route-title">
        <span className="method-badge" data-method={route.httpMethod}>
          {route.httpMethod}
        </span>{' '}
        <span className="mono">{route.path}</span>
      </h3>
      <p className="muted">
        {route.controller}.{route.method}
        {route.middlewares.length > 0 ? ` · middleware ${route.middlewares.join(', ')}` : ''}
        {route.validator ? ` · validator ${route.validator}` : ''}
        {route.contract ? ` · contract ${route.contract}` : ''}
        {route.staticServe ? ' · serves static files' : ''}
      </p>
      <form
        className="request-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {route.httpMethod === 'ALL' ? (
          <label className="field">
            <span>Method</span>
            <select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>
              {ALL_METHOD_CHOICES.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          </label>
        ) : null}
        {params.length > 0 ? (
          <fieldset className="kv-editor">
            <legend>Path parameters</legend>
            {params.map((param) => (
              <label key={param.name} className="field field-inline">
                <span className="mono">
                  {param.wildcard ? '*' : `:${param.name}`}
                  {param.optional ? ' (optional)' : ''}
                </span>
                <input
                  value={draft.params[param.name] ?? ''}
                  required={!param.optional}
                  onChange={(event) =>
                    setDraft({ ...draft, params: { ...draft.params, [param.name]: event.target.value } })
                  }
                />
              </label>
            ))}
          </fieldset>
        ) : null}
        <KeyValueEditor legend="Query" rows={draft.query} onChange={(query) => setDraft({ ...draft, query })} />
        <KeyValueEditor legend="Header" rows={draft.headers} onChange={(headers) => setDraft({ ...draft, headers })} />
        <label className="field">
          <span>Body (JSON){bodyAllowed ? '' : `: ${method} sends no body`}</span>
          <textarea
            className="mono"
            rows={6}
            value={bodyAllowed ? draft.body : ''}
            disabled={!bodyAllowed}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          />
        </label>
        {bodyProblem ? <p className="field-error">Not valid JSON, sent as typed: {bodyProblem}</p> : null}
        <p className="request-url">
          <span className="method-badge" data-method={method}>
            {method}
          </span>{' '}
          <code>{built.ok ? requestUrl(built.request) : route.path}</code>
        </p>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={!built.ok || !send || sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
          {!built.ok ? (
            <span className="field-error">Fill in {built.missing.map((name) => `:${name}`).join(', ')}</span>
          ) : null}
          {blockedReason ? <span className="muted">{blockedReason}</span> : null}
        </div>
      </form>
      <div aria-live="polite">
        {shown ? <ResponseView outcome={shown.outcome} truncated={shown.truncated} /> : null}
      </div>
      {history.length > 0 ? (
        <section className="history" aria-labelledby="history-title">
          <div className="history-header">
            <h4 id="history-title">History</h4>
            <button type="button" onClick={onClearHistory}>
              Clear history
            </button>
          </div>
          <ol className="plain-list">
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <button
                  type="button"
                  className="history-entry"
                  onClick={() => {
                    setDraft(entry.draft);
                    setShown({ outcome: entry.outcome, truncated: entry.truncated === true });
                  }}
                >
                  <span className="log-time">{formatClock(entry.at)}</span>{' '}
                  {entry.outcome.ok ? (
                    <span className="badge" data-tone={statusTone(entry.outcome.response.status)}>
                      {entry.outcome.response.status}
                    </span>
                  ) : (
                    <span className="badge" data-tone="error">
                      failed
                    </span>
                  )}{' '}
                  <span className="mono">{requestUrl(entry.request)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
};
