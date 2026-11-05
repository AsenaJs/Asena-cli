import { useState } from 'react';
import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import type { DevtoolsHello, DevtoolsRequestRecord, DevtoolsRoute, DevtoolsSnapshot } from '../../lib/console/protocol';
import { routeKey } from '../graph/buildGraph';
import type { EndpointFocus } from '../requests/records';
import { browserStorage, type StorageLike } from '../state/storage';
import { MethodBadge } from '../ui/components';
import { addToHistory, type HttpHistory, loadHistory, saveHistory } from './history';
import { type HttpOutcome, sendHttp } from './http';
import { RouteTester } from './RouteTester';
import { WebSocketTester } from './WebSocketTester';

type Selection = { kind: 'http'; key: string } | { kind: 'ws'; namespace: string };

export interface EndpointsPanelProps {
  snapshot: DevtoolsSnapshot;
  hello: DevtoolsHello | null;
  /** The current run, shown with each response. */
  gen?: number | null;
  token: string | null;
  /** The route to select first, e.g. picked in the graph's inspector or replayed from the request inspector. */
  focus: EndpointFocus | null;
  /** The request inspector's records, for the chain under each response. */
  requests?: DevtoolsRequestRecord[];
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

const initialSelection = (snapshot: DevtoolsSnapshot, focus: EndpointFocus | null): Selection | null => {
  const route = snapshot.routes.find((candidate) => routeKey(candidate) === focus?.key) ?? snapshot.routes[0];

  if (route) return { kind: 'http', key: routeKey(route) };

  const socket = snapshot.websockets[0];

  return socket ? { kind: 'ws', namespace: socket.namespace } : null;
};

export const EndpointsPanel = ({
  snapshot,
  hello,
  gen = null,
  token,
  focus,
  requests = [],
  storage = browserStorage(),
  send = sendHttp,
}: EndpointsPanelProps) => {
  const [selection, setSelection] = useState<Selection | null>(() => initialSelection(snapshot, focus));
  const [history, setHistory] = useState<HttpHistory>(() => loadHistory(storage));
  const route =
    selection?.kind === 'http' ? snapshot.routes.find((candidate) => routeKey(candidate) === selection.key) : undefined;
  const socket =
    selection?.kind === 'ws'
      ? snapshot.websockets.find((candidate) => candidate.namespace === selection.namespace)
      : undefined;
  const blocked = blockedReason(token, hello);

  const updateHistory = (change: (current: HttpHistory) => HttpHistory) =>
    setHistory((current) => {
      const next = change(current);

      saveHistory(storage, next);

      return next;
    });

  return (
    <div className="ep-layout">
      <nav className="card routes" aria-label="Endpoints">
        {groupByController(snapshot.routes).map(([controller, routes]) => (
          <div key={controller} className="route-group">
            <div className="group">
              <span>{controller}</span>
              <span>{routes.length}</span>
            </div>
            {routes.map((candidate) => (
              <button
                key={routeKey(candidate)}
                type="button"
                className="route"
                aria-current={candidate === route ? 'true' : undefined}
                onClick={() => setSelection({ kind: 'http', key: routeKey(candidate) })}
              >
                <MethodBadge method={candidate.httpMethod} />
                <span className="route-path">{candidate.path}</span>
                {candidate.validator ? <span className="tag mw">validated</span> : null}
              </button>
            ))}
          </div>
        ))}
        {snapshot.websockets.length > 0 ? (
          <div className="route-group">
            <div className="group">
              <span>WebSockets</span>
              <span>{snapshot.websockets.length}</span>
            </div>
            {snapshot.websockets.map((candidate) => (
              <button
                key={candidate.namespace}
                type="button"
                className="route"
                aria-current={candidate === socket ? 'true' : undefined}
                onClick={() => setSelection({ kind: 'ws', namespace: candidate.namespace })}
              >
                <MethodBadge method="WS" />
                <span className="route-path">/{candidate.namespace}</span>
              </button>
            ))}
          </div>
        ) : null}
        {snapshot.routes.length === 0 && snapshot.websockets.length === 0 ? (
          <p className="muted pane-note">The app registers no HTTP route and no WebSocket.</p>
        ) : null}
      </nav>
      {route ? (
        <RouteTester
          key={routeKey(route)}
          route={route}
          history={history[routeKey(route)] ?? []}
          send={token && blocked === null ? (request) => send(request, token) : null}
          blockedReason={blocked}
          port={hello?.port ?? null}
          gen={gen}
          requests={requests}
          {...(focus?.key === routeKey(route) ? { prefill: focus } : {})}
          onRecord={(entry) => updateHistory((current) => addToHistory(current, routeKey(route), entry))}
          onClearHistory={() => updateHistory((current) => ({ ...current, [routeKey(route)]: [] }))}
        />
      ) : null}
      {socket ? (
        <WebSocketTester
          key={socket.namespace}
          namespace={socket.namespace}
          component={socket.component}
          port={hello?.port ?? null}
        />
      ) : null}
    </div>
  );
};
