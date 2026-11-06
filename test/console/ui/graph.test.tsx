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
import type { GraphViewChoice } from '../../../console-ui/graph/focus';
import {
  fitViewport,
  GraphPanel,
  layoutBounds,
  toFlowEdges,
  toFlowNodes,
  viewportFor,
  widthFitViewport,
} from '../../../console-ui/graph/GraphPanel';
import { Inspector } from '../../../console-ui/graph/Inspector';
import { laneOf, nodeMeta } from '../../../console-ui/graph/lanes';
import {
  gridLayout,
  labelWidth,
  LABEL_HEIGHT,
  layoutGraph,
  NODE_HEIGHT,
  NODE_WIDTH,
  roundedPath,
} from '../../../console-ui/graph/layout';
import { kindLabel } from '../../../console-ui/ui/kinds';
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
        'soft component:ItemController -> component:AuditTrail [all routes]',
        'soft component:ItemController -> component:RequestTimer [POST /items/]',
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
    const graph = buildGraph(snapshot, { hidden: new Set(['MIDDLEWARE', 'VALIDATOR']), search: '' });

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

describe('graph lanes', () => {
  const graph = buildFullGraph(withCoreTarget);
  const laneNames = (lane: number) =>
    graph.nodes
      .filter((node) => laneOf(node) === lane)
      .map((node) => node.name)
      .sort();

  test('entry points, services and middleware, then data and errors', () => {
    expect(laneNames(0)).toEqual([
      'AdminPages',
      'AppConfig',
      'InventoryHandler',
      'ItemController',
      'ItemEvents',
      'ItemFeed',
      'NightlyCleanup',
    ]);
    expect(laneNames(2)).toEqual(['ApiExceptionHandler', 'EventEmitter', '__ulak__:items']);
  });

  test('a repository is a service by type and data by name', () => {
    const repository = { ...graph.nodes.find((node) => node.name === 'ItemDraft')!, name: 'ItemRepository' };

    expect(laneOf(repository)).toBe(2);
  });

  test('each node says what it is and the fact that sets it apart', () => {
    const meta = (name: string) =>
      nodeMeta(
        snapshot,
        buildFullGraph(snapshot).nodes.find((node) => node.name === name)!,
      );

    expect(meta('ItemController')).toBe('Controller · 4 routes');
    expect(meta('ItemService')).toBe('Service · 2 env values');
    expect(meta('CorsHeaders')).toBe('Middleware · every request');
    expect(meta('CreateItemValidator')).toBe('Middleware · validator');
    expect(meta('AuditTrail')).toBe('Middleware · route-level');
    expect(meta('ItemFeed')).toBe('WebSocket · /ws/items');
    expect(meta('NightlyCleanup')).toBe('Schedule · 0 3 * * *');
    expect(meta('ApiExceptionHandler')).toBe('Exception handler · 3 catches + 404');
    expect(meta('AppConfig')).toBe('Config · 1 global middleware');
    expect(meta('ItemEvents')).toBe('Event · audit.* +1');
  });
});

describe('graph first view', () => {
  // A laptop window with the inspector open leaves the canvas well under the three lanes' width at 0.6 zoom.
  test.each([
    [760, 520],
    [1180, 640],
    [420, 700],
    [2400, 1400],
  ])('every node and lane heading of the app fits a %ix%i canvas, inside the padding', async (width, height) => {
    const graph = buildFullGraph(withCoreTarget);
    const layout = await layoutGraph(graph);
    const view = fitViewport(layoutBounds(layout), width, height);
    const screen = (x: number, y: number) => ({ x: view.x + x * view.zoom, y: view.y + y * view.zoom });

    for (const position of layout.nodes.values()) {
      const topLeft = screen(position.x, position.y);
      const bottomRight = screen(position.x + NODE_WIDTH, position.y + NODE_HEIGHT);

      expect(topLeft.x).toBeGreaterThanOrEqual(0);
      expect(topLeft.y).toBeGreaterThanOrEqual(0);
      expect(bottomRight.x).toBeLessThanOrEqual(width);
      expect(bottomRight.y).toBeLessThanOrEqual(height);
    }

    for (const lane of layout.lanes) expect(screen(lane.x, layoutBounds(layout).y).y).toBeGreaterThanOrEqual(0);

    expect(view.zoom).toBeLessThanOrEqual(1);
  });

  test('a small app is shown at full size, centred', () => {
    const view = fitViewport({ x: 0, y: -34, width: 300, height: 200 }, 1000, 600);

    expect(view.zoom).toBe(1);
    expect(view.x).toBe(350);
    expect(view.y).toBe(34 + 200);
  });

  describe('fit floors', () => {
    const tall = { x: 0, y: -34, width: 900, height: 5000 };
    const wide = { x: 0, y: -34, width: 4000, height: 3000 };

    test('the fit that shows everything still goes down to the old minimum', () => {
      expect(viewportFor('all', { x: 0, y: 0, width: 20000, height: 20000 }, 800, 600).zoom).toBe(0.15);
    });

    test('Focus stops at 60% and is anchored at the top, whatever the height', () => {
      const view = viewportFor('focus', tall, 800, 600);

      expect(view.zoom).toBe(0.6);
      expect(view.y).toBe(24 + 34 * 0.6);
    });

    test('Focus on a neighbourhood wider than the canvas at the floor starts at its left edge', () => {
      expect(viewportFor('focus', wide, 800, 600).x).toBe(24);
    });

    test('Focus fits a small neighbourhood above the floor, centred, never above 100%', () => {
      const small = viewportFor('focus', { x: 0, y: -34, width: 300, height: 200 }, 1000, 600);

      expect(small.zoom).toBe(1);
      expect(small.x).toBe(350);
      expect(viewportFor('focus', { x: 0, y: 0, width: 1000, height: 300 }, 800, 600).zoom).toBeCloseTo(0.752);
    });

    test('Full on a large app fits the width with a 35% floor, ignoring the height', () => {
      expect(widthFitViewport(wide, 800).zoom).toBe(0.35);
      expect(widthFitViewport({ ...tall, width: 1432 }, 800).zoom).toBeCloseTo(0.5);
      expect(viewportFor('width', { ...tall, width: 1432 }, 800, 600).zoom).toBeCloseTo(0.5);
    });

    test('Full on a large app is anchored at the top, also when it is shorter than the canvas', () => {
      const short = widthFitViewport({ x: 0, y: -34, width: 1432, height: 100 }, 800);

      expect(short.y).toBeCloseTo(24 + 34 * 0.5);
    });

    test('Full on a large app starts its first lane clear of the zoom controls', () => {
      expect(widthFitViewport(wide, 800).x).toBe(60);
    });

    test('Full on a large app never shows above 100% and centres what is narrower', () => {
      const narrow = widthFitViewport({ x: 0, y: -34, width: 300, height: 200 }, 1000);

      expect(narrow.zoom).toBe(1);
      expect(narrow.x).toBe(368);
    });
  });
});

describe('graph layout', () => {
  const overlaps = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  test('elk places every node, each lane right of the one before', async () => {
    const graph = buildFullGraph(withCoreTarget);
    const layout = await layoutGraph(graph);
    const xs = (lane: number) =>
      graph.nodes.filter((node) => laneOf(node) === lane).map((node) => layout.nodes.get(node.id)!.x);

    expect([...layout.nodes.keys()].sort()).toEqual(graph.nodes.map((node) => node.id).sort());
    expect(Math.max(...xs(0)) + NODE_WIDTH).toBeLessThanOrEqual(Math.min(...xs(1)));
    expect(Math.max(...xs(1)) + NODE_WIDTH).toBeLessThanOrEqual(Math.min(...xs(2)));
    expect(layout.lanes.map((lane) => [lane.label, lane.x])).toEqual([
      ['Entry points', Math.min(...xs(0))],
      ['Services & middleware', Math.min(...xs(1))],
      ['Data & errors', Math.min(...xs(2))],
    ]);
  });

  test('every edge is routed from its source to its target, and no label pill sits on a node', async () => {
    const graph = buildFullGraph(withCoreTarget);
    const layout = await layoutGraph(graph);
    const boxes = [...layout.nodes.values()].map(({ x, y }) => ({ x, y, w: NODE_WIDTH, h: NODE_HEIGHT }));

    for (const edge of graph.edges) {
      const route = layout.edges.get(edge.id)!;

      expect(route.points.length).toBeGreaterThanOrEqual(2);

      if (edge.label === undefined) continue;

      const width = labelWidth(edge.label);
      const pill = { x: route.label!.x - width / 2, y: route.label!.y - LABEL_HEIGHT / 2, w: width, h: LABEL_HEIGHT };

      expect(boxes.filter((box) => overlaps(pill, box))).toEqual([]);
    }
  });

  test('the grid fallback places every node apart, by lane', () => {
    const graph = buildFullGraph(snapshot);
    const layout = gridLayout(graph);
    const cells = new Set([...layout.nodes.values()].map(({ x, y }) => `${x},${y}`));

    expect(cells.size).toBe(graph.nodes.length);
    expect(layout.edges.size).toBe(0);
    expect(layout.lanes.map((lane) => lane.lane)).toEqual([0, 1, 2]);
  });

  test('an orthogonal route gets rounded corners', () => {
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 40 },
      ]),
    ).toBe('M0 0 L12 0 Q20 0 20 8 L20 40');
    expect(roundedPath([])).toBe('');
  });
});

const inspect = (source: DevtoolsSnapshot, name: string) => {
  const graph = buildFullGraph(source);

  return renderToStaticMarkup(
    <Inspector
      snapshot={source}
      graph={graph}
      node={graph.nodes.find((node) => node.name === name) ?? null}
      onSelect={() => {}}
      onOpenRoute={() => {}}
    />,
  );
};

describe('graph selection and filter on the canvas', () => {
  const graph = buildFullGraph(snapshot);
  const layout = gridLayout(graph);
  const all = new Set(graph.nodes.map((node) => node.id));
  const controller = componentNodeId('ItemController');
  const state = (edges: ReturnType<typeof toFlowEdges>, id: string) => {
    const data = edges.find((edge) => edge.id === id)!.data!;

    return data.dim ? 'dim' : data.active ? 'active' : 'idle';
  };
  const injectId = graph.edges.find((edge) => edge.kind === 'inject')!.id;
  const strategyId = graph.edges.find((edge) => edge.kind === 'strategy')!.id;

  test('only the edges that touch the selected node are active', () => {
    const edges = toFlowEdges(graph, layout, all, controller);

    expect(state(edges, injectId)).toBe('active');
    expect(state(edges, strategyId)).toBe('idle');
    expect(state(toFlowEdges(graph, layout, all, null), injectId)).toBe('idle');
  });

  test('a filtered-out node is dimmed, not removed, and so are its edges', () => {
    const visible = new Set([...all].filter((id) => id !== componentNodeId('ItemService')));
    const nodes = toFlowNodes(snapshot, graph, layout, visible, controller);
    const service = nodes.find((node) => node.id === componentNodeId('ItemService'));

    expect(nodes.filter((node) => node.type === 'component')).toHaveLength(graph.nodes.length);
    expect(service?.type === 'component' && service.data.dim).toBe(true);
    expect(state(toFlowEdges(graph, layout, visible, controller), injectId)).toBe('dim');
    expect(nodes.filter((node) => node.type === 'lane').map((node) => node.data.label)).toEqual([
      'Entry points',
      'Services & middleware',
      'Data & errors',
    ]);
  });
});

const panel = (source: DevtoolsSnapshot, viewChoice: GraphViewChoice | null = null) =>
  renderToStaticMarkup(
    <GraphPanel
      snapshot={source}
      theme="light"
      viewChoice={viewChoice}
      onViewChoice={() => {}}
      onOpenRoute={() => {}}
    />,
  );

describe('graph panel rendering', () => {
  test('renders the search, one chip per present type, the canvas, the legend and the inspector', () => {
    const html = panel(snapshot);

    expect(html).toContain('aria-label="Find a component"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Controller</button>');
    expect(html).toContain('Exception handler</button>');
    expect(html).not.toContain('Core service</button>');
    expect(html).toContain(`${snapshot.components.length} of ${snapshot.components.length} components`);
    expect(html).toContain('react-flow');
    expect(html).toContain('guarded by middleware or validator');
    expect(html).toContain('<h3 id="inspector-title">ItemController</h3>');
  });

  const pressed = (html: string, label: string) =>
    new RegExp(`aria-pressed="true"[^>]*>(<i[^>]*></i>)?${label}(<|$)`).test(html);

  /** The fixture repeated past the size limit, with a service that injects a core service. */
  const largeApp: DevtoolsSnapshot = {
    ...withCoreTarget,
    components: [
      ...withCoreTarget.components,
      ...Array.from({ length: 41 }, (_, i) => ({
        ...withCoreTarget.components.find((component) => component.name === 'ItemDraft')!,
        name: `Extra${i}`,
        className: `Extra${i}`,
      })),
    ],
  };

  test("a small app opens in Full with today's chips and every component on", () => {
    const html = panel(snapshot);

    expect(pressed(html, 'Full')).toBe(true);
    expect(pressed(html, 'Focus')).toBe(false);
    expect(html).toContain('role="group" aria-label="Graph view"');
    expect(html).not.toContain('</i>Validator</button>');
    expect(pressed(html, 'Middleware')).toBe(true);
  });

  test('a large app opens in Focus on the first wired controller, showing only its neighbourhood', () => {
    const html = panel(largeApp);

    expect(pressed(html, 'Focus')).toBe(true);
    expect(html).toContain('<h3 id="inspector-title">ItemController</h3>');
    expect(pressed(html, 'Validator')).toBe(true);
    expect(pressed(html, 'Core service')).toBe(true);
    expect(html).toContain('5 of 61 components');
  });

  test('a large app in Full shows the core and validator chips off', () => {
    const html = panel(largeApp, { view: 'full', large: true });

    expect(pressed(html, 'Full')).toBe(true);
    expect(pressed(html, 'Validator')).toBe(false);
    expect(pressed(html, 'Core service')).toBe(false);
    expect(pressed(html, 'Middleware')).toBe(true);
    expect(html).toContain('58 of 61 components');
  });

  test('a choice made on the other side of the limit does not apply', () => {
    expect(pressed(panel(largeApp, { view: 'full', large: false }), 'Focus')).toBe(true);
    expect(pressed(panel(snapshot, { view: 'focus', large: true }), 'Full')).toBe(true);
  });

  test('the inspector lists scope, injections, users, @Value keys and the strategy targets', () => {
    const html = inspect(snapshot, 'ItemService');

    expect(html).toContain('singleton');
    expect(html).toContain('DollarFormatter');
    expect(html).toContain('formatters');
    expect(html).toContain('Used by');
    expect(html).toContain('ItemController');
    expect(html).toContain('DEVTOOLS_FIXTURE_PAGE_SIZE');
    expect(html).toContain('DEVTOOLS_FIXTURE_REGION');
  });

  test('a controller lists its routes, with the route-only middleware as tags, and links to Endpoints', () => {
    const html = inspect(snapshot, 'ItemController');

    expect(html).toContain('/items/:id/name');
    expect(html).toContain('<span class="tag mw">RequestTimer</span>');
    expect(html).not.toContain('<span class="tag mw">AuditTrail</span>');
    expect(html).toContain('Try these in Endpoints →');
  });

  test('type-specific details: catches, schedule, socket, events, messages and global middleware', () => {
    expect(inspect(snapshot, 'ApiExceptionHandler')).toContain('everything else');
    expect(inspect(snapshot, 'ApiExceptionHandler')).toContain('missingRoute()');
    expect(inspect(snapshot, 'NightlyCleanup')).toContain('0 3 * * *');
    expect(inspect(snapshot, 'ItemFeed')).toContain('/ws/items');
    expect(inspect(snapshot, 'ItemEvents')).toContain('item.created');
    expect(inspect(snapshot, 'InventoryHandler')).toContain('inventory.reserve');
    expect(inspect(snapshot, 'CorsHeaders')).toContain('/health');
    expect(inspect(snapshot, 'AppConfig')).toContain('onError');
  });

  test('a core node says the framework provides it; no selection asks for one', () => {
    const graph = buildFullGraph(withCoreTarget);
    const html = renderToStaticMarkup(
      <Inspector
        snapshot={withCoreTarget}
        graph={graph}
        node={graph.nodes.find((node) => node.id === coreNodeId('EventEmitter'))!}
        onSelect={() => {}}
        onOpenRoute={() => {}}
      />,
    );

    expect(html).toContain('Provided by the framework');
    expect(html).toContain('ItemService');
    expect(inspect(snapshot, 'nobody')).toContain('Select a component');
  });

  test('kind labels read as words', () => {
    expect(kindLabel('MESSAGE_CONTROLLER')).toBe('Message controller');
    expect(kindLabel('CORE')).toBe('Core service');
  });
});
