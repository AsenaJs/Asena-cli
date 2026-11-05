import { type KeyboardEvent, useState } from 'react';
import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import type { DevtoolsRequestStep, DevtoolsRoute } from '../../lib/console/protocol';
import { formatBytes } from '../runtime/format';
import { Card, MethodBadge, Pill, Tabs, type Tone } from '../ui/components';
import { highlightJson } from './highlight';
import type { HistoryEntry } from './history';
import type { HttpOutcome } from './http';
import {
  ALL_METHOD_CHOICES,
  buildRequest,
  draftFor,
  jsonProblem,
  type KeyValue,
  methodHasBody,
  type PathParam,
  pathParams,
  repeatedKeys,
  type RequestDraft,
  requestUrl,
} from './requestBuilder';

const STATUS_TEXT: Record<number, string> = {
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

export const statusTone = (status: number): Tone => {
  if (status >= 500) return 'bad';
  if (status >= 400) return 'warn';
  if (status >= 200 && status < 300) return 'ok';

  return 'neutral';
};

const byteSize = (text: string): number => new TextEncoder().encode(text).length;

type RequestTab = 'params' | 'query' | 'headers' | 'body';

type ResponseTab = 'body' | 'headers';

const KeyValueEditor = ({
  noun,
  rows,
  onChange,
}: {
  noun: string;
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
}) => {
  const repeated = repeatedKeys(rows);
  const update = (index: number, patch: Partial<KeyValue>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="fields">
      {rows.length === 0 ? <p className="muted pane-note">No {noun}s yet.</p> : null}
      {rows.map((row, index) => (
        <div key={index} className="field field-row">
          <input
            type="checkbox"
            checked={row.enabled !== false}
            aria-label={`Send ${noun} ${index + 1}`}
            onChange={(event) => update(index, { enabled: event.target.checked })}
          />
          <input
            className="input"
            aria-label={`${noun} name ${index + 1}`}
            placeholder="name"
            value={row.key}
            onChange={(event) => update(index, { key: event.target.value })}
          />
          <input
            className="input"
            aria-label={`${noun} value ${index + 1}`}
            placeholder="value"
            value={row.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button
            type="button"
            className="row-remove"
            aria-label={`Remove ${noun} ${index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="add-row" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        Add {noun}
      </button>
      {repeated.length > 0 ? (
        <p className="field-error">Repeated: {repeated.join(', ')}. Only the last value of each is sent.</p>
      ) : null}
    </div>
  );
};

/** The request URL with the host muted and each path parameter marked. */
const UrlLine = ({
  route,
  draft,
  params,
  origin,
  query,
}: {
  route: DevtoolsRoute;
  draft: RequestDraft;
  params: PathParam[];
  origin: string;
  query: string;
}) => {
  const names = new Set(params.map((param) => param.name));

  return (
    <div className="url" aria-label="Request URL">
      <span className="host">{origin}</span>
      {route.path.split('/').map((segment, index) => {
        const name = segment === '*' ? '*' : /^:([A-Za-z_$][\w$]*)/.exec(segment)?.[1];

        return (
          <span key={index}>
            {index > 0 ? '/' : ''}
            {name && names.has(name) ? (
              <span className="param" title={`:${name}`}>
                {draft.params[name] || (name === '*' ? '*' : `:${name}`)}
              </span>
            ) : (
              segment
            )}
          </span>
        );
      })}
      {query ? <span className="host">?{query}</span> : null}
    </div>
  );
};

export const ResponseView = ({
  outcome,
  truncated,
  gen,
}: {
  outcome: HttpOutcome | null;
  truncated?: boolean;
  gen?: number | null;
}) => {
  const [tab, setTab] = useState<ResponseTab>('body');

  if (!outcome) {
    return (
      <div className="pane-body">
        <p className="muted pane-note">Send the request to see the response.</p>
      </div>
    );
  }

  if (!outcome.ok) {
    return (
      <div className="pane-body">
        <p className="notice bad" role="alert">
          {outcome.reason}
        </p>
      </div>
    );
  }

  const { response } = outcome;
  const headers = Object.entries(response.headers);

  return (
    <>
      <div className="resp-meta">
        <Pill tone={statusTone(response.status)} dot>
          {response.status}
          {STATUS_TEXT[response.status] ? ` ${STATUS_TEXT[response.status]}` : ''}
        </Pill>
        <span>
          Time <b>{response.durationMs.toFixed(1)} ms</b>
        </span>
        <span>
          Size <b>{formatBytes(byteSize(response.body))}</b>
        </span>
        {gen ? <span className="muted resp-run">Run {gen}</span> : null}
      </div>
      <Tabs
        label="Response"
        idPrefix="response"
        tabs={[
          { id: 'body', label: 'Body' },
          { id: 'headers', label: 'Headers', badge: headers.length },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      <div className="pane-body" id={`response-panel-${tab}`} role="tabpanel" aria-labelledby={`response-tab-${tab}`}>
        {tab === 'body' ? (
          <pre className="code" tabIndex={0} aria-label="Response body">
            {response.body === '' ? <span className="muted">(empty body)</span> : highlightJson(response.body)}
          </pre>
        ) : (
          <dl className="kv mono">
            {headers.map(([name, value]) => (
              <div key={name} style={{ display: 'contents' }}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {truncated ? <p className="muted pane-note">The stored body was cut to keep the history small.</p> : null}
      </div>
    </>
  );
};

/** The steps that answered the request; the request inspector supplies them. */
export const ChainView = ({
  chain,
}: {
  chain: { steps: DevtoolsRequestStep[]; answeredBy: DevtoolsRequestStep } | null;
}) => (
  <div className="chain" aria-label="Handled by">
    <span>Handled by</span>
    {chain ? (
      chain.steps.map((step, index) => {
        const answered = step.kind === chain.answeredBy.kind && step.name === chain.answeredBy.name;
        const tone = answered ? (step.kind === 'controller' ? 'ok' : 'win') : '';

        return (
          <span key={`${step.kind}:${step.name}:${index}`} className="chain-step">
            {index > 0 ? <span aria-hidden="true">→</span> : null}
            <span className={`step ${tone}`}>{step.name}</span>
          </span>
        );
      })
    ) : (
      <span className="chain-empty">the request inspector shows the chain once the app reports it</span>
    )}
  </div>
);

export interface RouteTesterProps {
  route: DevtoolsRoute;
  history: HistoryEntry[];
  /** `null` when requests cannot be sent; the reason is shown instead. */
  send: ((request: ConsoleHttpRequest) => Promise<HttpOutcome>) | null;
  blockedReason: string | null;
  onRecord: (entry: HistoryEntry) => void;
  onClearHistory: () => void;
  port?: number | null;
  gen?: number | null;
}

const firstTab = (route: DevtoolsRoute, params: PathParam[]): RequestTab => {
  if (route.hasBodySchema && methodHasBody(route.httpMethod === 'ALL' ? 'GET' : route.httpMethod)) return 'body';

  return params.length > 0 ? 'params' : 'query';
};

export const RouteTester = ({
  route,
  history,
  send,
  blockedReason,
  onRecord,
  onClearHistory,
  port = null,
  gen = null,
}: RouteTesterProps) => {
  const params = pathParams(route.path);
  const [draft, setDraft] = useState<RequestDraft>(() => draftFor(route));
  const [tab, setTab] = useState<RequestTab>(() => firstTab(route, params));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(0);
  const [shown, setShown] = useState<{ outcome: HttpOutcome; truncated: boolean; gen: number | null } | null>(null);
  const built = buildRequest(route, draft);
  const method = route.httpMethod === 'ALL' ? draft.method : route.httpMethod;
  const bodyAllowed = methodHasBody(method);
  const bodyProblem = bodyAllowed ? jsonProblem(draft.body) : null;
  const query = built.ok ? requestUrl({ path: '', query: built.request.query }).replace(/^\?/, '') : '';
  const enabledCount = (rows: KeyValue[]) => rows.filter((row) => row.enabled !== false && row.key.trim()).length;

  const submit = async () => {
    if (!built.ok || !send || sending) return;

    setSending(true);
    setSent((count) => count + 1);

    const outcome = await send(built.request);

    setSending(false);
    setShown({ outcome, truncated: false, gen });
    onRecord({ at: Date.now(), draft, request: built.request, outcome, ...(gen ? { gen } : {}) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <section className="req" aria-labelledby="route-title" onKeyDown={onKeyDown}>
      <h2 id="route-title" className="visually-hidden">
        {route.httpMethod} {route.path}
      </h2>
      <Card>
        <div className="urlbar">
          {route.httpMethod === 'ALL' ? (
            <select
              className="method-sel"
              aria-label="Method"
              value={draft.method}
              onChange={(event) => setDraft({ ...draft, method: event.target.value })}
            >
              {ALL_METHOD_CHOICES.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          ) : (
            <MethodBadge method={method} className="method-sel" />
          )}
          <UrlLine
            route={route}
            draft={draft}
            params={params}
            origin={port === null ? '' : `http://127.0.0.1:${port}`}
            query={query}
          />
          <button type="button" className="send" disabled={!built.ok || !send || sending} onClick={() => void submit()}>
            {sending ? 'Sending…' : 'Send'} <kbd aria-hidden="true">Ctrl ↵</kbd>
          </button>
        </div>
        <div key={sent} className={sending ? 'loading-bar go' : 'loading-bar'} aria-hidden="true" />
      </Card>
      <div className="req-info">
        <span className="mono">
          {route.controller}.{route.method}
        </span>
        {route.middlewares.map((middleware) => (
          <span key={middleware} className="tag mw" title="middleware">
            {middleware}
          </span>
        ))}
        {route.validator ? <span className="tag mw">validator {route.validator}</span> : null}
        {route.contract ? <span className="tag">contract {route.contract}</span> : null}
        {route.staticServe ? <span className="tag">serves static files</span> : null}
        {!built.ok ? (
          <span className="field-error">Fill in {built.missing.map((name) => `:${name}`).join(', ')}</span>
        ) : null}
        {blockedReason ? <span className="muted">{blockedReason}</span> : null}
      </div>
      <div className="panes">
        <Card className="pane">
          <Tabs
            label="Request"
            idPrefix="request"
            tabs={[
              { id: 'params', label: 'Params', ...(params.length > 0 ? { badge: params.length } : {}) },
              {
                id: 'query',
                label: 'Query',
                ...(enabledCount(draft.query) > 0 ? { badge: enabledCount(draft.query) } : {}),
              },
              {
                id: 'headers',
                label: 'Headers',
                ...(enabledCount(draft.headers) > 0 ? { badge: enabledCount(draft.headers) } : {}),
              },
              { id: 'body', label: 'Body' },
            ]}
            selected={tab}
            onSelect={setTab}
          />
          <div className="pane-body" id={`request-panel-${tab}`} role="tabpanel" aria-labelledby={`request-tab-${tab}`}>
            {tab === 'params' ? (
              params.length > 0 ? (
                <div className="fields">
                  {params.map((param) => (
                    <div key={param.name} className="field field-param">
                      <span className="mono param-name">
                        {param.wildcard ? '*' : param.name}
                        {param.optional ? '?' : ''}
                      </span>
                      <input
                        className="input"
                        aria-label={`Path parameter ${param.name}`}
                        value={draft.params[param.name] ?? ''}
                        required={!param.optional}
                        onChange={(event) =>
                          setDraft({ ...draft, params: { ...draft.params, [param.name]: event.target.value } })
                        }
                      />
                      <span className="from">from the route path{param.optional ? ', optional' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted pane-note">This route has no path params.</p>
              )
            ) : null}
            {tab === 'query' ? (
              <KeyValueEditor
                noun="query param"
                rows={draft.query}
                onChange={(rows) => setDraft({ ...draft, query: rows })}
              />
            ) : null}
            {tab === 'headers' ? (
              <KeyValueEditor
                noun="header"
                rows={draft.headers}
                onChange={(rows) => setDraft({ ...draft, headers: rows })}
              />
            ) : null}
            {tab === 'body' ? (
              <div className="fields">
                <label className="visually-hidden" htmlFor="request-body">
                  Body (JSON)
                </label>
                <textarea
                  id="request-body"
                  className="textarea"
                  rows={8}
                  value={bodyAllowed ? draft.body : ''}
                  disabled={!bodyAllowed}
                  placeholder={bodyAllowed ? 'JSON body' : `${method} sends no body`}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
                {bodyAllowed ? null : <p className="muted pane-note">{method} sends no body.</p>}
                {bodyProblem ? <p className="field-error">Not valid JSON, sent as typed: {bodyProblem}</p> : null}
              </div>
            ) : null}
          </div>
          {history.length > 0 ? (
            <section className="history" aria-labelledby="history-title">
              <div className="history-head">
                <h3 id="history-title" className="section-title">
                  History
                </h3>
                <button type="button" className="link-btn quiet" onClick={onClearHistory}>
                  Clear history
                </button>
              </div>
              <ol className="history-list">
                {history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <button
                      type="button"
                      className="hist"
                      onClick={() => {
                        setDraft(entry.draft);
                        setShown({
                          outcome: entry.outcome,
                          truncated: entry.truncated === true,
                          gen: entry.gen ?? null,
                        });
                      }}
                    >
                      {entry.outcome.ok ? (
                        <span className={`st st-${String(entry.outcome.response.status)[0]}`}>
                          {entry.outcome.response.status}
                        </span>
                      ) : (
                        <span className="st st-5">failed</span>
                      )}
                      <MethodBadge method={entry.request.method} />
                      <span className="path">{requestUrl(entry.request)}</span>
                      <span className="ms">
                        {entry.outcome.ok ? `${entry.outcome.response.durationMs.toFixed(1)} ms` : '–'}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </Card>
        <Card className="pane" aria-live="polite">
          <ResponseView
            outcome={shown?.outcome ?? null}
            truncated={shown?.truncated ?? false}
            gen={shown?.gen ?? null}
          />
          <ChainView chain={null} />
        </Card>
      </div>
    </section>
  );
};
