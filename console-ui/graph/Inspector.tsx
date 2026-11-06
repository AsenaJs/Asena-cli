import type { ReactNode } from 'react';
import type { DevtoolsCatch, DevtoolsSnapshot } from '../../lib/console/protocol';
import { Card, Glyph, KeyValue, List, MethodBadge, Section } from '../ui/components';
import { kindLabel } from '../ui/kinds';
import { type Graph, type GraphEdge, type GraphNode, routeKey, routesOf } from './buildGraph';

export interface InspectorProps {
  snapshot: DevtoolsSnapshot;
  graph: Graph;
  node: GraphNode | null;
  onSelect: (id: string) => void;
  onOpenRoute: (key: string) => void;
}

const catchLabel = (entry: DevtoolsCatch): string =>
  entry.types === 'catch-all' ? 'everything else' : entry.types.map((type) => type.name).join(', ');

const yes = (value: boolean, whenTrue: string, whenFalse: string) => (value ? whenTrue : whenFalse);

const details = (snapshot: DevtoolsSnapshot, node: GraphNode): [string, ReactNode][] => {
  const { component } = node;

  if (!component) return [];

  const rows: [string, ReactNode][] = [['Scope', component.scope]];

  if (component.className !== component.name) rows.push(['Class', <span className="mono">{component.className}</span>]);
  if (component.interfaces.length > 0) rows.push(['Implements', component.interfaces.join(', ')]);

  const socket = snapshot.websockets.find((candidate) => candidate.component === component.name);
  const schedule = snapshot.schedules.find((candidate) => candidate.name === component.name);
  const global = snapshot.config.globalMiddlewares.find((entry) => entry.middleware === component.name);

  if (socket) rows.push(['Namespace', <span className="mono">/{socket.namespace}</span>]);
  if (schedule) rows.push(['Cron', <span className="mono">{schedule.cron}</span>]);
  if (global) {
    rows.push(['Runs', 'on every request']);
    if (global.include) rows.push(['Only', global.include.join(', ')]);
    if (global.exclude) rows.push(['Except', global.exclude.join(', ')]);
  }

  if (snapshot.config.component === component.name) {
    rows.push(['onError', yes(snapshot.config.hasOnError, 'defined', 'not defined')]);
    rows.push(['onNotFound', yes(snapshot.config.hasOnNotFound, 'defined', 'not defined')]);
  }

  return rows;
};

const EdgeList = ({
  edges,
  end,
  nameOf,
  onSelect,
}: {
  edges: GraphEdge[];
  end: 'source' | 'target';
  nameOf: (id: string) => string;
  onSelect: (id: string) => void;
}) => (
  <List>
    {edges.map((edge) => {
      const field = edge.kind === 'inject' || edge.kind === 'strategy';

      return (
        <li key={edge.id}>
          <span className="grow wraps">
            {end === 'target' && field && edge.label ? <span className="mono muted">{edge.label} → </span> : null}
            <button type="button" className="link-btn quiet" onClick={() => onSelect(edge[end])}>
              {nameOf(edge[end])}
            </button>
            {!field && edge.label && edge.label !== 'global' ? <span className="sub mono">{edge.label}</span> : null}
          </span>
          <span className="tag">{edge.kind === 'global-middleware' ? 'global' : edge.kind}</span>
        </li>
      );
    })}
  </List>
);

export const Inspector = ({ snapshot, graph, node, onSelect, onOpenRoute }: InspectorProps) => {
  if (!node) {
    return (
      <Card className="inspector" aria-label="Component details">
        <p className="muted">Select a component to see what it injects, who uses it and which routes it serves.</p>
      </Card>
    );
  }

  const nameOf = (id: string) => graph.nodes.find((candidate) => candidate.id === id)?.name ?? id;
  const outgoing = graph.edges.filter((edge) => edge.source === node.id);
  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const { component } = node;
  const routes = component ? routesOf(snapshot, component.name) : { serves: [], guards: [] };
  const everywhere = (middleware: string) => routes.serves.every((route) => route.middlewares.includes(middleware));
  const rows = details(snapshot, node);
  const events = snapshot.events.filter((handler) => handler.component === node.name);
  const messages = snapshot.messageHandlers.filter((handler) => handler.controller === node.name);
  const exceptions = snapshot.exceptionHandlers.find((handler) => handler.component === node.name);

  return (
    <Card className="inspector" aria-labelledby="inspector-title" aria-live="polite">
      <div className="insp-head">
        <Glyph kind={node.kind} large />
        <div>
          <h3 id="inspector-title">{node.name}</h3>
          <div className="muted insp-kind">{kindLabel(node.kind)}</div>
        </div>
      </div>

      {component ? null : <p className="muted">Provided by the framework, not by a component of this app.</p>}
      {rows.length > 0 ? (
        <Section title="Details">
          <KeyValue items={rows} />
        </Section>
      ) : null}

      {routes.serves.length > 0 ? (
        <Section title="Routes">
          <List>
            {routes.serves.map((route) => (
              <li key={routeKey(route)}>
                <MethodBadge method={route.httpMethod} />
                <span className="grow mono">{route.path}</span>
                {route.middlewares
                  .filter((middleware) => !everywhere(middleware))
                  .map((middleware) => (
                    <span key={middleware} className="tag mw">
                      {middleware}
                    </span>
                  ))}
                {route.validator ? <span className="tag mw">{route.validator}</span> : null}
              </li>
            ))}
          </List>
          <div className="insp-action">
            <button type="button" className="link-btn" onClick={() => onOpenRoute(routeKey(routes.serves[0]))}>
              Try these in Endpoints →
            </button>
          </div>
        </Section>
      ) : null}

      {routes.guards.length > 0 ? (
        <Section title="Runs on">
          <List>
            {routes.guards.map((route) => (
              <li key={routeKey(route)}>
                <MethodBadge method={route.httpMethod} />
                <button type="button" className="link-btn quiet grow mono" onClick={() => onOpenRoute(routeKey(route))}>
                  {route.path}
                </button>
                {route.validator === node.name ? <span className="tag">validator</span> : null}
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      {outgoing.length > 0 ? (
        <Section title="Injects">
          <EdgeList edges={outgoing} end="target" nameOf={nameOf} onSelect={onSelect} />
        </Section>
      ) : null}

      {incoming.length > 0 ? (
        <Section title="Used by">
          <EdgeList edges={incoming} end="source" nameOf={nameOf} onSelect={onSelect} />
        </Section>
      ) : null}

      {component && component.values.length > 0 ? (
        <Section title="Environment">
          <List>
            {component.values.map((value) => (
              <li key={value.field}>
                <span className="grow">
                  <span className="mono">{value.key}</span>
                  <span className="sub">
                    {value.field} · {value.isSet ? 'set' : value.hasDefault ? 'default' : 'not set'}
                    {value.parsed ? ' · parsed' : ''}
                  </span>
                </span>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      {events.length > 0 ? (
        <Section title="Listens to">
          <List>
            {events.map((handler) => (
              <li key={`${handler.event}:${handler.method}`}>
                <span className="grow mono">{handler.event}</span>
                <span className="mono muted">{handler.method}()</span>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      {messages.length > 0 ? (
        <Section title="Handles messages">
          <List>
            {messages.map((handler) => (
              <li key={`${handler.pattern}:${handler.method}`}>
                <span className="grow">
                  <span className="mono">{handler.pattern}</span>
                  <span className="sub">
                    {handler.kind} · {handler.transport}
                  </span>
                </span>
                <span className="mono muted">{handler.method}()</span>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      {exceptions ? (
        <Section title="Handles">
          <List>
            {exceptions.catches.map((entry) => (
              <li key={entry.method}>
                <span className="grow">{catchLabel(entry)}</span>
                <span className="mono muted">{entry.method}()</span>
              </li>
            ))}
            {exceptions.notFound ? (
              <li>
                <span className="grow">unmatched route</span>
                <span className="mono muted">{exceptions.notFound}()</span>
              </li>
            ) : null}
          </List>
        </Section>
      ) : null}
    </Card>
  );
};
