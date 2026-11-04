import type { DevtoolsRoute, DevtoolsSnapshot } from '../../lib/console/protocol';
import { type Graph, type GraphNode, type GraphNodeKind, routeKey, routesOf } from './buildGraph';

export const kindLabel = (kind: GraphNodeKind): string => {
  if (kind === 'CORE') return 'Core service';
  if (kind === 'WEBSOCKET') return 'WebSocket';

  const words = kind.toLowerCase().replaceAll('_', ' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
};

export interface ComponentDetailsProps {
  snapshot: DevtoolsSnapshot;
  graph: Graph;
  node: GraphNode;
  onSelect: (id: string) => void;
  onOpenRoute: (key: string) => void;
  onClose: () => void;
}

const RouteLinks = ({ routes, onOpenRoute }: { routes: DevtoolsRoute[]; onOpenRoute: (key: string) => void }) => (
  <ul className="plain-list">
    {routes.map((route) => (
      <li key={routeKey(route)}>
        <button type="button" className="link-button mono" onClick={() => onOpenRoute(routeKey(route))}>
          {routeKey(route)}
        </button>
      </li>
    ))}
  </ul>
);

const yesNo = (value: boolean) => (value ? 'yes' : 'no');

export const ComponentDetails = ({ snapshot, graph, node, onSelect, onOpenRoute, onClose }: ComponentDetailsProps) => {
  const nameOf = (id: string) => graph.nodes.find((candidate) => candidate.id === id)?.name ?? id;
  const outgoing = graph.edges.filter((edge) => edge.source === node.id);
  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const component = node.component;
  const routes = component ? routesOf(snapshot, component.name) : { serves: [], guards: [] };

  return (
    <aside
      className="graph-details"
      aria-labelledby="graph-details-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="graph-details-header">
        <h2 id="graph-details-title">{node.name}</h2>
        <button type="button" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <p>
        <span className="kind-badge" data-kind={node.kind}>
          {kindLabel(node.kind)}
        </span>
      </p>

      {component ? (
        <dl className="details-list">
          <dt>Scope</dt>
          <dd>{component.scope}</dd>
          {component.className !== component.name ? (
            <>
              <dt>Class</dt>
              <dd className="mono">{component.className}</dd>
            </>
          ) : null}
          <dt>Interfaces</dt>
          <dd>{component.interfaces.length > 0 ? component.interfaces.join(', ') : 'none'}</dd>
        </dl>
      ) : (
        <p className="muted">Provided by the framework, not by a component of this app.</p>
      )}

      {outgoing.length > 0 ? (
        <>
          <h3>Depends on</h3>
          <ul className="plain-list">
            {outgoing.map((edge) => (
              <li key={edge.id}>
                <button type="button" className="link-button" onClick={() => onSelect(edge.target)}>
                  {nameOf(edge.target)}
                </button>{' '}
                <span className="muted">
                  {edge.kind}
                  {edge.label ? ` · ${edge.label}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {incoming.length > 0 ? (
        <>
          <h3>Used by</h3>
          <ul className="plain-list">
            {incoming.map((edge) => (
              <li key={edge.id}>
                <button type="button" className="link-button" onClick={() => onSelect(edge.source)}>
                  {nameOf(edge.source)}
                </button>{' '}
                <span className="muted">
                  {edge.kind}
                  {edge.label ? ` · ${edge.label}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {component && component.values.length > 0 ? (
        <>
          <h3>@Value fields</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Env key</th>
                <th scope="col">Default</th>
                <th scope="col">Parsed</th>
                <th scope="col">Set</th>
              </tr>
            </thead>
            <tbody>
              {component.values.map((value) => (
                <tr key={value.field}>
                  <td className="mono">{value.field}</td>
                  <td className="mono">{value.key}</td>
                  <td>{yesNo(value.hasDefault)}</td>
                  <td>{yesNo(value.parsed)}</td>
                  <td>{yesNo(value.isSet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {routes.serves.length > 0 ? (
        <>
          <h3>Routes</h3>
          <RouteLinks routes={routes.serves} onOpenRoute={onOpenRoute} />
        </>
      ) : null}

      {routes.guards.length > 0 ? (
        <>
          <h3>Runs on routes</h3>
          <RouteLinks routes={routes.guards} onOpenRoute={onOpenRoute} />
        </>
      ) : null}
    </aside>
  );
};
