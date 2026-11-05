import type { DevtoolsComponent, DevtoolsRoute, DevtoolsSnapshot } from '../../lib/console/protocol';
import type { ComponentKind } from '../ui/kinds';

export type GraphNodeKind = ComponentKind;

export const GRAPH_NODE_KINDS: readonly GraphNodeKind[] = [
  'CONTROLLER',
  'SERVICE',
  'COMPONENT',
  'MIDDLEWARE',
  'WEBSOCKET',
  'MESSAGE_CONTROLLER',
  'EVENT',
  'SCHEDULE',
  'EXCEPTION_HANDLER',
  'CONFIG',
  'POST_PROCESSOR',
  'FRONTEND_CONTROLLER',
  'CORE',
];

export type GraphEdgeKind = 'inject' | 'soft' | 'strategy' | 'validator' | 'global-middleware';

export interface GraphNode {
  id: string;
  name: string;
  kind: GraphNodeKind;
  /** Absent on a core node. */
  component?: DevtoolsComponent;
  /** Whether the node matches the search; only set while searching. */
  matched: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilter {
  hidden: ReadonlySet<GraphNodeKind>;
  search: string;
}

export const componentNodeId = (name: string): string => `component:${name}`;

export const coreNodeId = (target: string): string => `core:${target}`;

export const routeKey = (route: Pick<DevtoolsRoute, 'httpMethod' | 'path'>): string =>
  `${route.httpMethod} ${route.path}`;

/** Where a controller's middleware runs: on all of its routes, or on the routes it names. */
const softLabel = (snapshot: DevtoolsSnapshot, controller: string, middleware: string): string | undefined => {
  const routes = snapshot.routes.filter((route) => route.controller === controller);
  const guarded = routes.filter((route) => route.middlewares.includes(middleware));

  if (guarded.length === 0) return undefined;
  if (guarded.length === routes.length) return 'all routes';

  const [first] = guarded;

  return guarded.length === 1 && first ? routeKey(first) : `${guarded.length} routes`;
};

/** Every node and edge of the snapshot, before any filter. */
export const buildFullGraph = (snapshot: DevtoolsSnapshot): Graph => {
  const byName = new Map(snapshot.components.map((component) => [component.name, component]));
  const nodes = new Map<string, GraphNode>(
    snapshot.components.map((component) => [
      componentNodeId(component.name),
      { id: componentNodeId(component.name), name: component.name, kind: component.type, component, matched: false },
    ]),
  );
  const edges: GraphEdge[] = [];

  // A target resolves the way the container does: a component name first, then an @Implements key.
  const resolve = (target: string): string[] => {
    if (byName.has(target)) return [componentNodeId(target)];

    const implementers = snapshot.components.filter((component) => component.interfaces.includes(target));

    if (implementers.length > 0) return implementers.map((component) => componentNodeId(component.name));

    const id = coreNodeId(target);

    if (!nodes.has(id)) nodes.set(id, { id, name: target, kind: 'CORE', matched: false });

    return [id];
  };

  const connect = (source: string, target: string, kind: GraphEdgeKind, discriminator: string, label?: string) => {
    for (const resolved of resolve(target)) {
      edges.push({
        id: `${kind}:${source}->${resolved}:${discriminator}`,
        source,
        target: resolved,
        kind,
        ...(label === undefined ? {} : { label }),
      });
    }
  };

  for (const component of snapshot.components) {
    for (const dependency of component.dependencies) {
      connect(
        componentNodeId(component.name),
        dependency.target,
        dependency.kind,
        dependency.field ?? '',
        dependency.field ?? softLabel(snapshot, component.name, dependency.target),
      );
    }
  }

  for (const route of snapshot.routes) {
    if (route.validator === null) continue;

    connect(componentNodeId(route.controller), route.validator, 'validator', routeKey(route), routeKey(route));
  }

  const { config } = snapshot;

  if (config.component !== undefined) {
    for (const entry of config.globalMiddlewares) {
      connect(componentNodeId(config.component), entry.middleware, 'global-middleware', entry.middleware, 'global');
    }
  }

  return { nodes: [...nodes.values()], edges };
};

const matches = (node: GraphNode, query: string): boolean =>
  [node.name, node.component?.className ?? '', ...(node.component?.interfaces ?? [])].some((text) =>
    text.toLowerCase().includes(query),
  );

/**
 * Drops hidden kinds and the edges that touch them. A search keeps the matching nodes and their direct
 * neighbours, so a match is shown with what it depends on and what depends on it.
 */
export const filterGraph = (graph: Graph, filter: GraphFilter): Graph => {
  const visible = graph.nodes.filter((node) => !filter.hidden.has(node.kind));
  const visibleIds = new Set(visible.map((node) => node.id));
  const edges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const query = filter.search.trim().toLowerCase();

  if (query === '') return { nodes: visible, edges };

  const matched = new Set(visible.filter((node) => matches(node, query)).map((node) => node.id));
  const kept = new Set(matched);

  for (const edge of edges) {
    if (matched.has(edge.source)) kept.add(edge.target);
    if (matched.has(edge.target)) kept.add(edge.source);
  }

  return {
    nodes: visible.filter((node) => kept.has(node.id)).map((node) => ({ ...node, matched: matched.has(node.id) })),
    edges: edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)),
  };
};

export const buildGraph = (snapshot: DevtoolsSnapshot, filter: GraphFilter): Graph =>
  filterGraph(buildFullGraph(snapshot), filter);

/** The routes a component serves, and the routes that run it as middleware or validator. */
export const routesOf = (snapshot: DevtoolsSnapshot, name: string) => ({
  serves: snapshot.routes.filter((route) => route.controller === name),
  guards: snapshot.routes.filter((route) => route.validator === name || route.middlewares.includes(name)),
});
