import { Fragment, useState } from 'react';
import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import type { DevtoolsHello, DevtoolsRequestRecord, DevtoolsRoute, DevtoolsSnapshot } from '../../lib/console/protocol';
import { routeKey } from '../graph/buildGraph';
import type { EndpointFocus } from '../requests/records';
import { browserStorage, type StorageLike } from '../state/storage';
import { Card, MethodBadge } from '../ui/components';
import { Icon } from '../ui/icons';
import { addToHistory, type HttpHistory, loadHistory, saveHistory } from './history';
import { type HttpOutcome, sendHttp } from './http';
import type { RoutePrefill, SavedDraft, SavedDrafts } from './requestBuilder';
import { RouteTester } from './RouteTester';
import { WebSocketTester } from './WebSocketTester';

export type Selection = { kind: 'http'; key: string } | { kind: 'ws'; namespace: string };

export interface EndpointsPanelProps {
  snapshot: DevtoolsSnapshot;
  hello: DevtoolsHello | null;
  /** The current run, shown with each response. */
  gen?: number | null;
  token: string | null;
  /** The route to select first, e.g. picked in the graph's inspector or replayed from the request inspector. */
  focus: EndpointFocus | null;
  /** Each route's form as the user left it, kept by the shell so a remount resumes it; the panel keeps its own without. */
  drafts?: SavedDrafts;
  onDraft?: (key: string, saved: SavedDraft) => void;
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

/** The same route (method and path) or socket in a new snapshot, or `null` when it is gone. */
export const reconcileSelection = (selection: Selection | null, snapshot: DevtoolsSnapshot): Selection | null => {
  if (selection?.kind === 'http') {
    return snapshot.routes.some((route) => routeKey(route) === selection.key) ? selection : null;
  }

  if (selection?.kind === 'ws') {
    return snapshot.websockets.some((socket) => socket.namespace === selection.namespace) ? selection : null;
  }

  return null;
};

/** A replay is applied once: opening a route with values from a record forgets the draft that route had. */
export const draftsForOpen = (drafts: SavedDrafts, focus: EndpointFocus): SavedDrafts => {
  if (focus.params === undefined && focus.method === undefined) return drafts;

  return Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== focus.key));
};

const testerStart = (
  saved: SavedDraft | undefined,
  focus: EndpointFocus | null,
): { saved?: SavedDraft; prefill?: RoutePrefill } => {
  if (saved) return saved.prefill ? { saved, prefill: saved.prefill } : { saved };
  if (!focus) return {};

  return {
    prefill: { ...(focus.params ? { params: focus.params } : {}), ...(focus.method ? { method: focus.method } : {}) },
  };
};

const selectionLabel = (selection: Selection): string =>
  selection.kind === 'http' ? selection.key : `WS /${selection.namespace}`;

const RoutePath = ({ path }: { path: string }) => (
  <span className="route-path" title={path}>
    {path.split(/(?=\/)/).map((part, index) => (
      <Fragment key={index}>
        {index > 0 ? <wbr /> : null}
        <span className="route-path-part">{part}</span>
      </Fragment>
    ))}
  </span>
);

export const NoSelection = ({ gone }: { gone: string | null }) => (
  <Card className="empty" aria-labelledby="endpoint-none-title">
    <span className="empty-icon">
      <Icon name="endpoints" />
    </span>
    <h2 id="endpoint-none-title">{gone ? `${gone} is gone after the restart` : 'Pick an endpoint'}</h2>
    <p>
      {gone
        ? 'The app no longer registers it. Pick another endpoint from the list; the request history of every route is kept.'
        : 'Pick a route or a WebSocket from the list to send it a request.'}
    </p>
  </Card>
);

export const EndpointsPanel = ({
  snapshot,
  hello,
  gen = null,
  token,
  focus,
  drafts: shellDrafts,
  onDraft: onShellDraft,
  requests = [],
  storage = browserStorage(),
  send = sendHttp,
}: EndpointsPanelProps) => {
  const [selection, setSelection] = useState<Selection | null>(() => initialSelection(snapshot, focus));
  const [selectedIn, setSelectedIn] = useState(snapshot);
  const [gone, setGone] = useState<string | null>(null);
  const [history, setHistory] = useState<HttpHistory>(() => loadHistory(storage));
  const [ownDrafts, setOwnDrafts] = useState<SavedDrafts>({});
  const drafts = shellDrafts ?? ownDrafts;
  const onDraft =
    onShellDraft ?? ((key: string, saved: SavedDraft) => setOwnDrafts((current) => ({ ...current, [key]: saved })));

  if (snapshot !== selectedIn) {
    const kept = reconcileSelection(selection, snapshot);

    setSelectedIn(snapshot);
    setSelection(kept);

    if (selection && !kept) setGone(selectionLabel(selection));
  }

  const select = (next: Selection) => {
    setSelection(next);
    setGone(null);
  };

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
                onClick={() => select({ kind: 'http', key: routeKey(candidate) })}
              >
                <MethodBadge method={candidate.httpMethod} />
                <RoutePath path={candidate.path} />
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
                onClick={() => select({ kind: 'ws', namespace: candidate.namespace })}
              >
                <MethodBadge method="WS" />
                <RoutePath path={`/${candidate.namespace}`} />
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
          {...testerStart(drafts[routeKey(route)], focus?.key === routeKey(route) ? focus : null)}
          onDraft={(saved) => onDraft(routeKey(route), saved)}
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
      {!route && !socket && (snapshot.routes.length > 0 || snapshot.websockets.length > 0) ? (
        <NoSelection gone={gone} />
      ) : null}
    </div>
  );
};
