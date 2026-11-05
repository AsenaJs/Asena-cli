import { useState } from 'react';
import type { DevtoolsHello, DevtoolsSnapshot } from '../../lib/console/protocol';
import { Card, Pill } from '../ui/components';
import { type Answer, catchAllHandler, catchRows, notFoundHandler, whoCatches } from './catches';

export interface ExceptionsPanelProps {
  snapshot: DevtoolsSnapshot;
  hello: DevtoolsHello | null;
  /** The name to resolve first. */
  initialQuery?: string;
}

const Head = ({ title, count }: { title: string; count?: number }) => (
  <div className="msg-section-head">
    <h2 className="section-title">{title}</h2>
    {count === undefined ? null : <span className="muted num">{count}</span>}
  </div>
);

const answerText = (answer: Answer, adapter: string): string => {
  switch (answer.kind) {
    case 'catch':
      return answer.via === 'brand'
        ? `${answer.handler}, through @Catch(HttpException): the error carries the HttpException brand and no narrower @Catch matches.`
        : `${answer.handler}, the @Catch(${answer.type}) nearest on its class chain.`;
    case 'catch-all':
      return `${answer.handler}, the catch-all: no @Catch type is on its class chain.`;
    case 'config-onError':
      return '@Config.onError (deprecated): no @Catch matches and there is no catch-all.';
    case 'adapter-default':
      return `${adapter}'s default error response: no @Catch matches, there is no catch-all and no @Config.onError.`;
  }
};

const winner = (answer: Answer): string | null => (answer.kind === 'catch' ? answer.type : null);

const WhoCatches = ({
  snapshot,
  adapter,
  initialQuery,
}: {
  snapshot: DevtoolsSnapshot;
  adapter: string;
  initialQuery: string;
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [branded, setBranded] = useState(false);
  const name = query.trim();
  const result = name === '' ? null : whoCatches(snapshot, name, branded);
  const matched = result ? winner(result.answer) : null;

  return (
    <Card className="msg-section" aria-label="Who catches this?">
      <Head title="Who catches this?" />
      <div className="who">
        <div className="who-inputs">
          <label className="search who-field">
            <input
              aria-label="Error type name"
              placeholder="An error class name, e.g. ItemMissing"
              value={query}
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="who-brand">
            <input type="checkbox" checked={branded} onChange={(event) => setBranded(event.target.checked)} />
            carries the HttpException brand (an adapter's own HTTP error, or a second core copy)
          </label>
        </div>
        {result ? (
          <div className="who-result" aria-live="polite">
            {result.known ? null : (
              <p className="notice" role="note">
                The app knows no class named {name}: it is not a caught type or an ancestor of one. If it extends a
                caught type, that type's handler answers; otherwise:
              </p>
            )}
            {result.ambiguous ? (
              <p className="notice" role="note">
                More than one class named {name} is on a caught type's chain; this follows the first.
              </p>
            ) : null}
            <ol className="walk" aria-label="Class chain, walked upward">
              {result.chain.map((link, index) => (
                <li key={`${link}-${index}`} className={link === matched ? 'hit' : undefined}>
                  {index > 0 ? <span aria-hidden="true">→</span> : null}
                  <span className="step">{link}</span>
                </li>
              ))}
            </ol>
            <p className="who-answer">
              <span className="eyebrow">Answered by</span>
              {answerText(result.answer, adapter)}
            </p>
          </div>
        ) : (
          <p className="muted pane-note">
            Type a class name to walk its chain the way the exception registry does: the nearest @Catch, then
            @Catch(HttpException) for a branded error, then the catch-all.
          </p>
        )}
      </div>
    </Card>
  );
};

export const ExceptionsPanel = ({ snapshot, hello, initialQuery = '' }: ExceptionsPanelProps) => {
  const rows = catchRows(snapshot);
  const catchAll = catchAllHandler(snapshot);
  const notFound = notFoundHandler(snapshot);
  const adapter = hello?.adapter ?? 'The adapter';
  const declared = (value: boolean) =>
    value ? <Pill tone="neutral">defined, deprecated</Pill> : <span className="muted">not defined</span>;

  return (
    <div className="exceptions">
      <WhoCatches snapshot={snapshot} adapter={adapter} initialQuery={initialQuery} />
      <Card className="msg-section" aria-label="Thrown errors">
        <Head title="Thrown errors" count={rows.length + (catchAll ? 1 : 0)} />
        {rows.length > 0 || catchAll ? (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Error type to @Catch handler</caption>
              <thead>
                <tr>
                  <th scope="col">Error type</th>
                  <th scope="col">Class chain</th>
                  <th scope="col">Handler</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.type}>
                    <td className="mono">
                      {row.type}
                      {row.httpException ? (
                        <span className="tag cell-tag" title="Matched by brand across class trees">
                          HttpException brand
                        </span>
                      ) : null}
                    </td>
                    <td className="mono muted chain-cell">{row.chain.slice(1).join(' → ') || '–'}</td>
                    <td className="mono">{row.handler}</td>
                  </tr>
                ))}
                {catchAll ? (
                  <tr>
                    <td>
                      <span className="muted">anything else</span>
                    </td>
                    <td className="muted">catch-all @Catch()</td>
                    <td className="mono">{catchAll}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted pane-note table-note">The app declares no @Catch handler.</p>
        )}
        <div className="config-body fallback">
          <span className="eyebrow">When nothing above matches</span>
          <dl className="kv">
            <dt>@Config.onError()</dt>
            <dd>{declared(snapshot.config.hasOnError)}</dd>
            <dt>Then</dt>
            <dd>{adapter}'s default error response</dd>
          </dl>
        </div>
      </Card>
      <Card className="msg-section" aria-label="Unmatched routes">
        <Head title="Unmatched routes" />
        <div className="config-body">
          <dl className="kv">
            <dt>@NotFound()</dt>
            <dd>{notFound ? <span className="mono">{notFound}</span> : <span className="muted">not declared</span>}</dd>
            <dt>@Config.onNotFound()</dt>
            <dd>{declared(snapshot.config.hasOnNotFound)}</dd>
            <dt>Then</dt>
            <dd>{adapter}'s default 404</dd>
          </dl>
        </div>
      </Card>
    </div>
  );
};
