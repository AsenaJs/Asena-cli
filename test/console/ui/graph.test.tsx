import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DevtoolsSnapshot } from '../../../lib/console/protocol';
import {
  buildFullGraph,
  buildGraph,
  componentNodeId,
  coreNodeId,
  type Graph,
  type GraphNodeKind,
  routesOf,
} from '../../../console-ui/graph/buildGraph';
import { ComponentDetails, kindLabel } from '../../../console-ui/graph/ComponentDetails';
import { GraphPanel } from '../../../console-ui/graph/GraphPanel';
import { gridLayout, layoutGraph } from '../../../console-ui/graph/layout';
import snapshotJson from '../fixtures/snapshot.json';

const snapshot = snapshotJson as unknown as DevtoolsSnapshot;
const none = new Set<GraphNodeKind>();

const edgeList = (graph: Graph) =>
  graph.edges.map((edge) => `${edge.kind} ${edge.source} -> ${edge.target}${edge.label ? ` [${edge.label}]` : ''}`);

/** The fixture snapshot with one dependency on a core service and one on an @Implements key with one implementer. */
const withCoreTarget: DevtoolsSnapshot = {
  ...snapshot,
  components: snapshot.components.map((component) =>
    component.name === 'ItemService'
      ? {
          ...component,
          dependencies: [
            ...component.dependencies,
            { field: 'ulak', target: '__ulak__:items', kind: 'inject' },
            { field: 'events', target: 'EventEmitter', kind: 'inject' },
          ],
        }
      : component.name === 'ItemEvents'
        ? { ...component, dependencies: [{ field: 'formatter', target: 'PriceFormatter', kind: 'inject' }] }
        : component,
  ),
};

describe('buildFullGraph over snapshot.json', () => {
  const graph = buildFullGraph(snapshot);

  test('one node per component, typed by the component type', () => {
    expect(graph.nodes.filter((node) => node.kind !== 'CORE')).toHaveLength(snapshot.components.length);
    expect(graph.nodes.find((node) => node.id === componentNodeId('ItemController'))?.kind).toBe('CONTROLLER');
    expect(graph.nodes.find((node) => node.id === componentNodeId('RequestTimer'))?.component?.className).toBe(
      'RequestTimerMiddleware',
    );
  });

  test('draws inject, soft and strategy dependencies, route validators and global middleware', () => {
    expect(edgeList(graph).sort()).toEqual(
      [
        'inject component:ItemController -> component:ItemService [itemService]',
        'soft component:ItemController -> component:AuditTrail',
        'soft component:ItemController -> component:RequestTimer',
        'strategy component:ItemService -> component:DollarFormatter [formatters]',
        'strategy component:ItemService -> component:EuroFormatter [formatters]',
        'validator component:ItemController -> component:CreateItemValidator [POST /items/]',
        'global-middleware component:AppConfig -> component:CorsHeaders [global]',
      ].sort(),
    );
  });

  test('has no core nodes when every target is a component or an interface of one', () => {
    expect(graph.nodes.filter((node) => node.kind === 'CORE')).toEqual([]);
  });

  test('turns a target no component provides into one core node per target', () => {
    const withCore = buildFullGraph(withCoreTarget);
    const core = withCore.nodes.filter((node) => node.kind === 'CORE');

    expect(core.map((node) => node.id).sort()).toEqual([coreNodeId('EventEmitter'), coreNodeId('__ulak__:items')]);
    expect(core.every((node) => node.component === undefined)).toBe(true);
    expect(edgeList(withCore)).toContain('inject component:ItemService -> core:EventEmitter [events]');
  });

  test('resolves an @Implements key to its implementers, not to a core node', () => {
    const withCore = buildFullGraph(withCoreTarget);

    expect(edgeList(withCore)).toContain('inject component:ItemEvents -> component:DollarFormatter [formatter]');
    expect(withCore.nodes.some((node) => node.id === coreNodeId('PriceFormatter'))).toBe(false);
  });

  test('every edge id is unique and every edge ends on a node', () => {
    const ids = new Set(graph.nodes.map((node) => node.id));

    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
    expect(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });
});

describe('graph filters', () => {
  test('hiding a type drops its nodes and every edge that touches them', () => {
    const graph = buildGraph(snapshot, { hidden: new Set(['MIDDLEWARE']), search: '' });

    expect(graph.nodes.some((node) => node.kind === 'MIDDLEWARE')).toBe(false);
    expect(edgeList(graph).sort()).toEqual([
      'inject component:ItemController -> component:ItemService [itemService]',
      'strategy component:ItemService -> component:DollarFormatter [formatters]',
      'strategy component:ItemService -> component:EuroFormatter [formatters]',
    ]);
  });

  test('core nodes are a type of their own that can be hidden', () => {
    const graph = buildGraph(withCoreTarget, { hidden: new Set(['CORE']), search: '' });

    expect(graph.nodes.some((node) => node.kind === 'CORE')).toBe(false);
    expect(graph.edges.some((edge) => edge.target.startsWith('core:'))).toBe(false);
  });

  test('search keeps the matches, marked, and their direct neighbours', () => {
    const graph = buildGraph(snapshot, { hidden: none, search: '  itemservice ' });

    expect(graph.nodes.map((node) => `${node.name}${node.matched ? '*' : ''}`).sort()).toEqual([
      'DollarFormatter',
      'EuroFormatter',
      'ItemController',
      'ItemService*',
    ]);
    expect(graph.edges).toHaveLength(3);
  });

  test('search matches class names and interfaces too', () => {
    expect(
      buildGraph(snapshot, { hidden: none, search: 'RequestTimerMiddleware' })
        .nodes.filter((node) => node.matched)
        .map((node) => node.name),
    ).toEqual(['RequestTimer']);
    expect(
      buildGraph(snapshot, { hidden: none, search: 'priceformatter' })
        .nodes.filter((node) => node.matched)
        .map((node) => node.name)
        .sort(),
    ).toEqual(['DollarFormatter', 'EuroFormatter']);
  });

  test('search and type filter combine: a hidden neighbour is not brought back', () => {
    const graph = buildGraph(snapshot, { hidden: new Set(['SERVICE']), search: 'ItemController' });

    expect(graph.nodes.map((node) => node.name).sort()).toEqual([
      'AuditTrail',
      'CreateItemValidator',
      'ItemController',
      'RequestTimer',
    ]);
  });

  test('a search with no match leaves an empty graph', () => {
    expect(buildGraph(snapshot, { hidden: none, search: 'nothing-like-this' })).toEqual({ nodes: [], edges: [] });
  });
});

describe('routesOf', () => {
  test('lists the routes a controller serves and the routes a middleware runs on', () => {
    expect(routesOf(snapshot, 'ItemController').serves).toHaveLength(4);
    expect(routesOf(snapshot, 'CreateItemValidator').guards.map((route) => route.path)).toEqual(['/items/']);
    expect(routesOf(snapshot, 'RequestTimer').guards.map((route) => route.path)).toEqual(['/items/']);
  });
});

describe('graph layout', () => {
  test('elk places every node, a dependency to the right of its dependant', async () => {
    const graph = buildFullGraph(snapshot);
    const positions = await layoutGraph(graph);

    expect([...positions.keys()].sort()).toEqual(graph.nodes.map((node) => node.id).sort());
    expect(positions.get(componentNodeId('ItemService'))!.x).toBeGreaterThan(
      positions.get(componentNodeId('ItemController'))!.x,
    );
  });

  test('the grid fallback places every node apart', () => {
    const graph = buildFullGraph(snapshot);
    const cells = new Set([...gridLayout(graph).values()].map(({ x, y }) => `${x},${y}`));

    expect(cells.size).toBe(graph.nodes.length);
  });
});

describe('graph panel rendering', () => {
  test('renders the toolbar with one filter per present type and the canvas', () => {
    const html = renderToStaticMarkup(<GraphPanel snapshot={snapshot} theme="light" onOpenRoute={() => {}} />);

    expect(html).toContain('Component graph');
    expect(html).toContain('aria-label="Search components"');
    expect(html).toContain('>Controller<');
    expect(html).toContain('>Exception handler<');
    expect(html).not.toContain('>Core service<');
    expect(html).toContain(`${snapshot.components.length} of ${snapshot.components.length} nodes`);
    expect(html).toContain('react-flow');
  });

  test('the details panel lists scope, dependencies, @Value fields and route links', () => {
    const graph = buildFullGraph(snapshot);
    const node = graph.nodes.find((candidate) => candidate.name === 'ItemService')!;
    const html = renderToStaticMarkup(
      <ComponentDetails
        snapshot={snapshot}
        graph={graph}
        node={node}
        onSelect={() => {}}
        onOpenRoute={() => {}}
        onClose={() => {}}
      />,
    );

    expect(html).toContain('singleton');
    expect(html).toContain('DollarFormatter');
    expect(html).toContain('ItemController');
    expect(html).toContain('DEVTOOLS_FIXTURE_PAGE_SIZE');
    expect(html).toContain('DEVTOOLS_FIXTURE_REGION');

    const controller = renderToStaticMarkup(
      <ComponentDetails
        snapshot={snapshot}
        graph={graph}
        node={graph.nodes.find((candidate) => candidate.name === 'ItemController')!}
        onSelect={() => {}}
        onOpenRoute={() => {}}
        onClose={() => {}}
      />,
    );

    expect(controller).toContain('PUT /items/:id/name');
  });

  test('a core node says the framework provides it', () => {
    const graph = buildFullGraph(withCoreTarget);
    const html = renderToStaticMarkup(
      <ComponentDetails
        snapshot={withCoreTarget}
        graph={graph}
        node={graph.nodes.find((node) => node.id === coreNodeId('EventEmitter'))!}
        onSelect={() => {}}
        onOpenRoute={() => {}}
        onClose={() => {}}
      />,
    );

    expect(html).toContain('Provided by the framework');
    expect(html).toContain('ItemService');
  });

  test('kind labels read as words', () => {
    expect(kindLabel('MESSAGE_CONTROLLER')).toBe('Message controller');
    expect(kindLabel('CORE')).toBe('Core service');
  });
});
