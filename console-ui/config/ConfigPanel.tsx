import type { DevtoolsHello, DevtoolsMetrics, DevtoolsSnapshot } from '../../lib/console/protocol';
import { transportStates } from '../messaging/commands';
import { Card, Glyph, KeyValue, Pill, SectionHead } from '../ui/components';
import { type ValueState, valueRows, valueState } from './values';

export interface ConfigPanelProps {
  snapshot: DevtoolsSnapshot;
  hello: DevtoolsHello | null;
  metrics: DevtoolsMetrics[];
}

const STATE_TEXT: Record<ValueState, string> = {
  set: 'set',
  default: 'unset, default used',
  missing: 'unset, no default',
};

const yesNo = (value: boolean) => (value ? 'yes' : <span className="muted">no</span>);

export const ConfigPanel = ({ snapshot, hello, metrics }: ConfigPanelProps) => {
  const rows = valueRows(snapshot);
  const { config } = snapshot;
  const transports = transportStates(hello, metrics);

  return (
    <div className="config-view">
      <Card className="msg-section" aria-label="@Value fields">
        <SectionHead title="@Value fields" count={rows.length} />
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">@Value fields</caption>
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Field</th>
                  <th scope="col">Environment key</th>
                  <th scope="col">Default</th>
                  <th scope="col">Parse</th>
                  <th scope="col">Variable</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = valueState(row);

                  return (
                    <tr key={`${row.component}.${row.field}`}>
                      <td>
                        <span className="cell-component">
                          <Glyph kind={row.componentType} />
                          {row.component}
                        </span>
                      </td>
                      <td className="mono">{row.field}</td>
                      <td className="mono">
                        {row.key}
                        {row.secret ? (
                          <span className="tag cell-tag" title="The key reads like a credential">
                            secret-looking
                          </span>
                        ) : null}
                      </td>
                      <td>{yesNo(row.hasDefault)}</td>
                      <td>{yesNo(row.parsed)}</td>
                      <td>
                        {state === 'missing' ? (
                          <Pill tone="warn">{STATE_TEXT[state]}</Pill>
                        ) : (
                          <span className={state === 'set' ? undefined : 'muted'}>{STATE_TEXT[state]}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted pane-note table-note">The app declares no @Value field.</p>
        )}
        <p className="muted pane-note table-note foot-note">
          Values are never sent to the console; the app reports only whether each variable is set.
        </p>
      </Card>
      <div className="config-grid">
        <Card className="msg-section" aria-label="Config">
          <SectionHead title="@Config" />
          <div className="config-body">
            <KeyValue
              items={[
                ['Component', config.component ?? <span className="muted">none declared</span>],
                [
                  'onError()',
                  config.hasOnError ? (
                    'defined (deprecated): answers when no @Catch matches'
                  ) : (
                    <span className="muted">not defined</span>
                  ),
                ],
                [
                  'onNotFound()',
                  config.hasOnNotFound ? (
                    'defined (deprecated): answers unmatched routes when no @NotFound is declared'
                  ) : (
                    <span className="muted">not defined</span>
                  ),
                ],
              ]}
            />
          </div>
        </Card>
        <Card className="msg-section" aria-label="Server">
          <SectionHead title="Server" />
          <div className="config-body">
            {hello ? (
              <KeyValue
                items={[
                  ['Adapter', hello.adapter ?? 'headless'],
                  [
                    'Port',
                    hello.port === null ? (
                      <span className="muted">no HTTP</span>
                    ) : (
                      <span className="mono">{hello.port}</span>
                    ),
                  ],
                  ['Core', <span className="mono">{hello.coreVersion}</span>],
                  ['pid', <span className="mono">{hello.pid}</span>],
                ]}
              />
            ) : (
              <p className="muted pane-note">Waiting for the app to report.</p>
            )}
          </div>
        </Card>
      </div>
      <Card className="msg-section" aria-label="Global middleware">
        <SectionHead title="Global middleware" count={config.globalMiddlewares.length} />
        {config.globalMiddlewares.length > 0 ? (
          <ol className="cmd-list ordered">
            {config.globalMiddlewares.map((entry, index) => (
              <li key={`${entry.middleware}-${index}`} className="cmd-item">
                <div className="cmd-info">
                  <span className="num muted">{index + 1}</span>
                  <span className="cmd-name">{entry.middleware}</span>
                  <span className="cmd-meta">
                    {entry.include ? `only ${entry.include.join(', ')}` : 'every route'}
                    {entry.exclude ? `, except ${entry.exclude.join(', ')}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted pane-note table-note">No global middleware.</p>
        )}
      </Card>
      <Card className="msg-section" aria-label="Transports">
        <SectionHead title="Transports" count={transports.length} />
        {transports.length > 0 ? (
          <ul className="cmd-list">
            {transports.map((transport) => (
              <li key={transport.name} className="cmd-item">
                <div className="cmd-head">
                  <span className="cmd-info">
                    <span className="mono cmd-name">{transport.name}</span>
                  </span>
                  <Pill tone={transport.connected ? 'ok' : 'bad'} dot>
                    {transport.connected ? 'connected' : 'disconnected'}
                  </Pill>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted pane-note table-note">
            {hello ? 'The app configures no microservice transport.' : 'Waiting for the app to report.'}
          </p>
        )}
      </Card>
    </div>
  );
};
