import { type KeyboardEvent, useState } from 'react';
import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import type { DevtoolsHello, DevtoolsRoute, DevtoolsSnapshot } from '../../lib/console/protocol';
import { routeKey } from '../graph/buildGraph';
import { browserStorage, type StorageLike } from '../state/storage';
import { addToHistory, type HttpHistory, loadHistory, saveHistory } from './history';
import { type HttpOutcome, sendHttp } from './http';
import { RouteTester } from './RouteTester';
import { WebSocketTester } from './WebSocketTester';

type Tab = 'http' | 'ws';

export interface EndpointsPanelProps {
  snapshot: DevtoolsSnapshot;
  hello: DevtoolsHello | null;
  token: string | null;
  /** The route key to select first, e.g. the one picked in the graph's side panel. */
  focusedRoute: string | null;
  storage?: StorageLike | null;
  send?: (request: ConsoleHttpRequest, token: string) => Promise<HttpOutcome>;
}

export const groupByController = (routes: DevtoolsRoute[]): [string, DevtoolsRoute[]][] => {
  const groups = new Map<string, DevtoolsRoute[]>();

  for (const route of routes) groups.set(route.controller, [...(groups.get(route.controller) ?? []), route]);

  return [...groups.entries()];
};

const blockedReason = (token: string | null, hello: DevtoolsHello | null): string | null => {
  if (!token) return 'No session token in the page URL.';
  if (!hello) return 'Waiting for the app to start; the host answers 502 until it has.';
  if (hello.port === null) return 'The app runs headless and serves no HTTP.';

  return null;
};

export const EndpointsPanel = ({
  snapshot,
  hello,
  token,
  focusedRoute,
  storage = browserStorage(),
  send = sendHttp,
}: EndpointsPanelProps) => {
  const [tab, setTab] = useState<Tab>('http');
  const [selected, setSelected] = useState<string | null>(focusedRoute);
  const [selectedSocket, setSelectedSocket] = useState<string | null>(null);
  const [history, setHistory] = useState<HttpHistory>(() => loadHistory(storage));
  const route = snapshot.routes.find((candidate) => routeKey(candidate) === selected) ?? snapshot.routes[0] ?? null;
  const socket =
    snapshot.websockets.find((candidate) => candidate.namespace === selectedSocket) ?? snapshot.websockets[0] ?? null;

  const blocked = blockedReason(token, hello);

  const updateHistory = (change: (current: HttpHistory) => HttpHistory) =>
    setHistory((current) => {
      const next = change(current);

      saveHistory(storage, next);

      return next;
    });

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    const next: Tab = tab === 'http' ? 'ws' : 'http';

    setTab(next);
    document.getElementById(`endpoints-tab-${next}`)?.focus();
  };

  const tabProps = (id: Tab) => ({
    id: `endpoints-tab-${id}`,
    role: 'tab',
    type: 'button' as const,
    'aria-selected': tab === id,
    'aria-controls': `endpoints-panel-${id}`,
    tabIndex: tab === id ? 0 : -1,
    className: 'tab',
    onClick: () => setTab(id),
    onKeyDown: onTabKey,
  });

  return (
    <section className="panel endpoints-panel" aria-labelledby="endpoints-title">
      <h2 id="endpoints-title">Endpoints</h2>
      <div role="tablist" aria-label="Endpoint kinds" className="tabs">
        <button {...tabProps('http')}>HTTP routes ({snapshot.routes.length})</button>
        <button {...tabProps('ws')}>WebSockets ({snapshot.websockets.length})</button>
      </div>

      {tab === 'http' ? (
        <div id="endpoints-panel-http" role="tabpanel" aria-labelledby="endpoints-tab-http" className="endpoints-body">
          <nav className="endpoint-list" aria-label="Routes">
            {groupByController(snapshot.routes).map(([controller, routes]) => (
              <div key={controller}>
                <h3>{controller}</h3>
                <ul className="plain-list">
                  {routes.map((candidate) => (
                    <li key={routeKey(candidate)}>
                      <button
                        type="button"
                        className="endpoint-item"
                        aria-current={candidate === route ? 'true' : undefined}
                        onClick={() => setSelected(routeKey(candidate))}
                      >
                        <span className="method-badge" data-method={candidate.httpMethod}>
                          {candidate.httpMethod}
                        </span>
                        <span className="mono">{candidate.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {snapshot.routes.length === 0 ? <p className="muted">The app registers no HTTP routes.</p> : null}
          </nav>
          {route ? (
            <RouteTester
              key={routeKey(route)}
              route={route}
              history={history[routeKey(route)] ?? []}
              send={token && blocked === null ? (request) => send(request, token) : null}
              blockedReason={blocked}
              onRecord={(entry) => updateHistory((current) => addToHistory(current, routeKey(route), entry))}
              onClearHistory={() => updateHistory((current) => ({ ...current, [routeKey(route)]: [] }))}
            />
          ) : null}
        </div>
      ) : (
        <div id="endpoints-panel-ws" role="tabpanel" aria-labelledby="endpoints-tab-ws" className="endpoints-body">
          <nav className="endpoint-list" aria-label="WebSocket namespaces">
            <ul className="plain-list">
              {snapshot.websockets.map((candidate) => (
                <li key={candidate.namespace}>
                  <button
                    type="button"
                    className="endpoint-item"
                    aria-current={candidate === socket ? 'true' : undefined}
                    onClick={() => setSelectedSocket(candidate.namespace)}
                  >
                    <span className="mono">/{candidate.namespace}</span>
                  </button>
                </li>
              ))}
            </ul>
            {snapshot.websockets.length === 0 ? <p className="muted">The app declares no WebSocket.</p> : null}
          </nav>
          {socket ? (
            <WebSocketTester
              key={socket.namespace}
              namespace={socket.namespace}
              component={socket.component}
              port={hello?.port ?? null}
            />
          ) : null}
        </div>
      )}
    </section>
  );
};
