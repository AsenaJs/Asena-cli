import { describe, expect, test } from 'bun:test';
import type { DevtoolsComponent, DevtoolsRoute, DevtoolsSnapshot } from '../../../lib/console/protocol';
import {
  buildFullGraph,
  chipKindOf,
  componentNodeId,
  coreNodeId,
  filterGraph,
  type Graph,
} from '../../../console-ui/graph/buildGraph';
import {
  currentView,
  defaultHiddenInFull,
  defaultView,
  edgeState,
  firstSelection,
  fitModeFor,
  focusGraph,
  graphCountLabel,
  groupNodeId,
  isGroupNode,
  isLargeApp,
  kindChips,
  LARGE_APP_LIMIT,
  neighbourIds,
  openingPick,
  searchResults,
  withoutEdgeLabels,
} from '../../../console-ui/graph/focus';
import { nodeMeta } from '../../../console-ui/graph/lanes';
import { viewCount } from '../../../console-ui/shell/Sidebar';
import snapshotJson from '../fixtures/snapshot.json';

const fixture = snapshotJson as unknown as DevtoolsSnapshot;

const component = (name: string, overrides: Partial<DevtoolsComponent> = {}): DevtoolsComponent => ({
  name,
  type: 'SERVICE',
  scope: 'singleton',
  interfaces: [],
  className: name,
  dependencies: [],
  values: [],
  ...overrides,
});

const route = (controller: string, path: string, validator: string | null): DevtoolsRoute =>
  ({
    controller,
    httpMethod: 'POST',
    path,
    middlewares: [],
    validator,
  }) as unknown as DevtoolsRoute;

const inject = (target: string) => ({ field: target.toLowerCase(), target, kind: 'inject' as const });

/**
 * About 90 nodes: `BigController` with 6 validators, 5 core services and 3 services; each of those services used by
 * further controllers; plain middleware beside the validators, and one component nobody is wired to.
 */
const largeSnapshot = (): DevtoolsSnapshot => {
  const validators = Array.from({ length: 6 }, (_, i) => component(`Check${i}Validator`, { type: 'MIDDLEWARE' }));
  const small = Array.from({ length: 3 }, (_, i) => component(`Small${i}Validator`, { type: 'MIDDLEWARE' }));
  const services = Array.from({ length: 40 }, (_, i) =>
    component(`Service${i}`, { dependencies: i > 0 ? [inject(`Service${i - 1}`)] : [] }),
  );
  const controllers = Array.from({ length: 30 }, (_, i) =>
    component(`Controller${i}`, { type: 'CONTROLLER', dependencies: [inject(`Service${i}`)] }),
  );
  const big = component('BigController', {
    type: 'CONTROLLER',
    className: 'TheBigControllerClass',
    dependencies: [
      inject('Service0'),
      inject('Service1'),
      inject('Service2'),
      ...['CoreA', 'CoreB', 'CoreC', 'CoreD', 'CoreE'].map(inject),
      { field: null, target: 'AuthGuard', kind: 'soft' as const },
    ],
  });
  const few = component('FewController', {
    type: 'CONTROLLER',
    dependencies: [inject('CoreA'), inject('CoreB'), inject('CoreC')],
  });

  return {
    ...fixture,
    components: [
      component('Lonely'),
      big,
      few,
      component('AuthGuard', { type: 'MIDDLEWARE' }),
      ...validators,
      ...small,
      ...services,
      ...controllers,
    ],
    routes: [
      ...validators.map((validator, i) => route('BigController', `/big/${i}`, validator.name)),
      ...small.map((validator, i) => route('FewController', `/few/${i}`, validator.name)),
      route('BigController', '/guarded', null),
    ],
    config: { ...fixture.config, component: undefined, globalMiddlewares: [] },
  } as DevtoolsSnapshot;
};

const large = largeSnapshot();
const graph = buildFullGraph(large);
const big = componentNodeId('BigController');
const none = new Set<never>();
const noGroups = new Set<never>();
const names = (shown: Graph) => shown.nodes.map((node) => node.name).sort();

describe('the default view', () => {
  test('the synthetic graph is a large app of about 90 nodes', () => {
    expect(graph.nodes.length).toBeGreaterThan(85);
    expect(graph.nodes.length).toBeLessThan(100);
  });

  test('Focus above the limit, Full up to it', () => {
    expect(LARGE_APP_LIMIT).toBe(40);
    expect(defaultView(41)).toBe('focus');
    expect(defaultView(40)).toBe('full');
    expect(defaultView(fixture.components.length)).toBe('full');
    expect(isLargeApp(41)).toBe(true);
    expect(isLargeApp(40)).toBe(false);
  });

  test("the user's choice holds on the same side of the limit", () => {
    expect(currentView({ view: 'full', large: true }, 93)).toBe('full');
    expect(currentView({ view: 'focus', large: false }, 14)).toBe('focus');
    expect(currentView({ view: 'full', large: true }, 41)).toBe('full');
  });

  test('a change in size across the limit drops the choice', () => {
    expect(currentView({ view: 'focus', large: true }, 40)).toBe('full');
    expect(currentView({ view: 'full', large: false }, 41)).toBe('focus');
    expect(currentView(null, 93)).toBe('focus');
    expect(currentView(null, 14)).toBe('full');
  });

  test('Full starts with core services and validators off on a large app only', () => {
    expect([...defaultHiddenInFull(true)].sort()).toEqual(['CORE', 'VALIDATOR']);
    expect(defaultHiddenInFull(false).size).toBe(0);
  });

  test('each view has its own first fit', () => {
    expect(fitModeFor('focus', true)).toBe('focus');
    expect(fitModeFor('focus', false)).toBe('focus');
    expect(fitModeFor('full', true)).toBe('width');
    expect(fitModeFor('full', false)).toBe('all');
  });
});

describe('the first selection', () => {
  test('stays the first controller when it has a neighbour', () => {
    expect(firstSelection(buildFullGraph(fixture))).toBe(componentNodeId('ItemController'));
    expect(firstSelection(graph)).toBe(big);
  });

  test('skips a controller without neighbours', () => {
    const shown = buildFullGraph({
      ...large,
      components: [component('EmptyController', { type: 'CONTROLLER' }), ...large.components],
    });

    expect(firstSelection(shown)).toBe(big);
  });

  test('falls to any wired node when no controller has a neighbour', () => {
    const shown = buildFullGraph({
      ...large,
      routes: [],
      components: [
        component('EmptyController', { type: 'CONTROLLER' }),
        component('A'),
        component('B', { dependencies: [inject('A')] }),
      ],
    });

    expect(firstSelection(shown)).toBe(componentNodeId('A'));
  });

  test('keeps the first controller when nothing has a neighbour, and null on an empty graph', () => {
    const lonely = buildFullGraph({
      ...large,
      routes: [],
      components: [component('A'), component('EmptyController', { type: 'CONTROLLER' })],
    });

    expect(firstSelection(lonely)).toBe(componentNodeId('EmptyController'));
    expect(firstSelection({ nodes: [], edges: [] })).toBe(null);
  });

  test('a component that only injects itself has no neighbour', () => {
    const selfOnly = buildFullGraph({
      ...large,
      routes: [],
      components: [
        component('SelfController', { type: 'CONTROLLER', dependencies: [inject('SelfController')] }),
        component('A'),
        component('B', { dependencies: [inject('A')] }),
      ],
    });

    expect(firstSelection(selfOnly)).toBe(componentNodeId('A'));
  });
});

describe('the neighbourhood', () => {
  test('follows edges in both directions', () => {
    const service = componentNodeId('Service1');

    expect([...neighbourIds(graph, service)].sort()).toEqual(
      [big, componentNodeId('Controller1'), componentNodeId('Service0'), componentNodeId('Service2')].sort(),
    );
  });

  test('every edge kind counts', () => {
    const ids = neighbourIds(graph, big);

    expect(ids.has(componentNodeId('Service0'))).toBe(true);
    expect(ids.has(componentNodeId('AuthGuard'))).toBe(true);
    expect(ids.has(componentNodeId('Check0Validator'))).toBe(true);
    expect(ids.has(coreNodeId('CoreA'))).toBe(true);
  });

  test('an unknown id and an isolated node have none', () => {
    expect(neighbourIds(graph, 'component:Nobody').size).toBe(0);
    expect(neighbourIds(graph, componentNodeId('Lonely')).size).toBe(0);
  });

  test('a node is not its own neighbour', () => {
    const selfish = buildFullGraph({
      ...large,
      routes: [],
      components: [component('A', { dependencies: [inject('A')] })],
    });

    expect(neighbourIds(selfish, componentNodeId('A')).size).toBe(0);
  });
});

describe('the focus graph', () => {
  const focus = (focusId: string | null, hidden: Parameters<typeof focusGraph>[1]['hidden'] = none) =>
    focusGraph(graph, { focusId, hidden, expanded: noGroups });

  test('shows the focus and its neighbours, not the rest', () => {
    const shown = focus(componentNodeId('Service1'));

    expect(names(shown)).toEqual(['BigController', 'Controller1', 'Service0', 'Service1', 'Service2']);
  });

  test('keeps only the edges that touch the focus', () => {
    const shown = focus(componentNodeId('Service1'));

    expect(
      shown.edges.every(
        (edge) => edge.source === componentNodeId('Service1') || edge.target === componentNodeId('Service1'),
      ),
    ).toBe(true);
    expect(shown.edges.map((edge) => edge.source)).toContain(big);
    expect(shown.edges.map((edge) => edge.target)).toContain(componentNodeId('Service0'));
  });

  test('an unknown id or no focus shows nothing; an isolated node shows itself', () => {
    expect(focus('component:Nobody')).toEqual({ nodes: [], edges: [] });
    expect(focus(null)).toEqual({ nodes: [], edges: [] });
    expect(names(focus(componentNodeId('Lonely')))).toEqual(['Lonely']);
  });

  test('more than three validators collapse into one node, core services likewise', () => {
    const shown = focus(big);

    expect(names(shown)).toEqual(
      ['5 core services', '6 validators', 'AuthGuard', 'BigController', 'Service0', 'Service1', 'Service2'].sort(),
    );

    const validators = shown.nodes.find((node) => node.id === groupNodeId('validators'))!;

    expect(validators.group?.members).toHaveLength(6);
    expect(validators.kind).toBe('MIDDLEWARE');
    expect(shown.nodes.find((node) => node.id === groupNodeId('core'))?.kind).toBe('CORE');
  });

  test('exactly three stay individual', () => {
    const shown = focusGraph(graph, {
      focusId: componentNodeId('FewController'),
      hidden: none,
      expanded: noGroups,
    });

    expect(names(shown)).toEqual(
      ['CoreA', 'CoreB', 'CoreC', 'FewController', 'Small0Validator', 'Small1Validator', 'Small2Validator'].sort(),
    );
    expect(shown.nodes.some((node) => isGroupNode(node.id))).toBe(false);
  });

  test('a group has one edge from the focus, saying how many it stands for, and its members none', () => {
    const shown = focus(big);
    const toGroup = shown.edges.filter((edge) => edge.target === groupNodeId('validators'));

    expect(toGroup).toHaveLength(1);
    expect(toGroup[0]?.kind).toBe('validator');
    expect(toGroup[0]?.label).toBe('6 routes');
    expect(shown.edges.find((edge) => edge.target === groupNodeId('core'))?.label).toBe('5 fields');
    expect(shown.edges.some((edge) => edge.target === componentNodeId('Check0Validator'))).toBe(false);
    expect(new Set(shown.edges.map((edge) => edge.id)).size).toBe(shown.edges.length);
  });

  test('a group keeps both directions apart', () => {
    const mixed = buildFullGraph({
      ...large,
      routes: [],
      components: [
        component('Hub', { dependencies: ['W', 'X', 'Y', 'Z'].map(inject) }),
        ...['A', 'B', 'C', 'D'].map((name) => component(`${name}Controller`, { dependencies: [inject('Hub')] })),
      ],
    });
    const withValidator = {
      ...mixed,
      nodes: mixed.nodes.map((node) => (node.name.endsWith('Controller') ? { ...node, validator: true } : node)),
    };
    const shown = focusGraph(withValidator, {
      focusId: componentNodeId('Hub'),
      hidden: none,
      expanded: noGroups,
    });

    expect(shown.edges.map((edge) => `${edge.source} -> ${edge.target}`).sort()).toEqual([
      `${componentNodeId('Hub')} -> ${groupNodeId('core')}`,
      `${groupNodeId('validators')} -> ${componentNodeId('Hub')}`,
    ]);
  });

  test('expanding a group shows its members in place, the other stays collapsed', () => {
    const shown = focusGraph(graph, { focusId: big, hidden: none, expanded: new Set(['validators']) });

    expect(shown.nodes.some((node) => node.id === groupNodeId('validators'))).toBe(false);
    expect(names(shown)).toContain('Check0Validator');
    expect(names(shown)).toContain('Check5Validator');
    expect(names(shown)).toContain('5 core services');
    expect(shown.edges.filter((edge) => edge.kind === 'validator')).toHaveLength(6);
  });

  test('kind chips filter what is shown, never the focus itself', () => {
    expect(names(focus(big, new Set(['VALIDATOR', 'SERVICE'])))).toEqual([
      '5 core services',
      'AuthGuard',
      'BigController',
    ]);
    expect(names(focus(big, new Set(['CONTROLLER', 'CORE'])))).toContain('BigController');
    expect(names(focus(componentNodeId('Service1'), new Set(['SERVICE'])))).toEqual([
      'BigController',
      'Controller1',
      'Service1',
    ]);
  });

  test('a hidden member does not count towards the threshold', () => {
    const shown = buildFullGraph({
      ...large,
      routes: [],
      components: [component('Hub', { dependencies: ['W', 'X', 'Y', 'Z'].map(inject) })],
    });
    const oneOff = {
      ...shown,
      nodes: shown.nodes.map((node) => (node.name === 'W' ? { ...node, kind: 'SERVICE' as const } : node)),
    };

    expect(
      names(focusGraph(oneOff, { focusId: componentNodeId('Hub'), hidden: new Set(['SERVICE']), expanded: noGroups })),
    ).toEqual(['Hub', 'X', 'Y', 'Z']);
  });

  test('a group says what clicking it does', () => {
    const shown = focus(big);
    const meta = (id: string) =>
      nodeMeta(
        large,
        shown.nodes.find((node) => node.id === id)!,
      );

    expect(meta(groupNodeId('validators'))).toBe('Middleware · click to expand');
    expect(meta(groupNodeId('core'))).toBe('Core service · click to expand');
  });
});

describe('validators as a chip', () => {
  test('a middleware that is a route validator is marked, a plain one is not', () => {
    const node = (name: string) => graph.nodes.find((candidate) => candidate.name === name)!;

    expect(node('Check0Validator').validator).toBe(true);
    expect(chipKindOf(node('Check0Validator'))).toBe('VALIDATOR');
    expect(node('Check0Validator').kind).toBe('MIDDLEWARE');
    expect(node('AuthGuard').validator).toBe(false);
    expect(chipKindOf(node('AuthGuard'))).toBe('MIDDLEWARE');
    expect(chipKindOf(node('CoreA'))).toBe('CORE');
  });

  test('filtering by the validator chip leaves plain middleware, and the other way round', () => {
    const withoutValidators = filterGraph(graph, { hidden: new Set(['VALIDATOR']), search: '' });
    const withoutMiddleware = filterGraph(graph, { hidden: new Set(['MIDDLEWARE']), search: '' });

    expect(withoutValidators.nodes.some((node) => node.validator)).toBe(false);
    expect(withoutValidators.nodes.some((node) => node.name === 'AuthGuard')).toBe(true);
    expect(withoutMiddleware.nodes.some((node) => node.validator)).toBe(true);
    expect(withoutMiddleware.nodes.some((node) => node.name === 'AuthGuard')).toBe(false);
  });

  test('a large app has its own validator chip, right after middleware', () => {
    const chips = kindChips(graph, true);

    expect(chips.map((chip) => chip.id)).toEqual(['CONTROLLER', 'SERVICE', 'MIDDLEWARE', 'VALIDATOR', 'CORE']);
    expect(chips.find((chip) => chip.id === 'VALIDATOR')?.label).toBe('Validator');
    expect(chips.find((chip) => chip.id === 'VALIDATOR')?.keys).toEqual(['VALIDATOR']);
    expect(chips.find((chip) => chip.id === 'MIDDLEWARE')?.keys).toEqual(['MIDDLEWARE']);
    expect(chips.find((chip) => chip.id === 'VALIDATOR')?.color).toBe('var(--t-middleware)');
  });

  test("a small app keeps today's chips: its middleware chip covers the validators", () => {
    const small = buildFullGraph(fixture);
    const chips = kindChips(small, false);

    expect(chips.some((chip) => chip.id === 'VALIDATOR')).toBe(false);
    expect(chips.find((chip) => chip.id === 'MIDDLEWARE')?.keys).toEqual(['MIDDLEWARE', 'VALIDATOR']);
    expect(chips.find((chip) => chip.id === 'MIDDLEWARE')?.label).toBe('Middleware');
  });

  test('a large app with only validators still offers no empty middleware chip', () => {
    const shown = buildFullGraph({
      ...large,
      components: large.components.filter((entry) => entry.name !== 'AuthGuard'),
    });

    expect(kindChips(shown, true).some((chip) => chip.id === 'MIDDLEWARE')).toBe(false);
  });
});

describe('search results', () => {
  test('finds a component outside the neighbourhood, whatever the case', () => {
    expect(searchResults(graph, 'service39').map((node) => node.name)).toEqual(['Service39']);
    expect(
      focusGraph(graph, { focusId: big, hidden: none, expanded: noGroups }).nodes.map((node) => node.name),
    ).not.toContain('Service39');
  });

  test('searches class names and core services too', () => {
    expect(searchResults(graph, 'TheBigControllerClass').map((node) => node.name)).toEqual(['BigController']);
    expect(searchResults(graph, 'corea').map((node) => node.id)).toEqual([coreNodeId('CoreA')]);
  });

  test('an empty query or no match gives nothing', () => {
    expect(searchResults(graph, '   ')).toEqual([]);
    expect(searchResults(graph, 'nothing-like-this')).toEqual([]);
  });

  test('a name that starts with the query comes first, then alphabetical', () => {
    const shown = buildFullGraph({
      ...large,
      routes: [],
      components: [
        component('MyQueueService'),
        component('QueueService'),
        component('QueueController', { type: 'CONTROLLER' }),
        component('Other', { className: 'QueueHelper' }),
      ],
    });

    expect(searchResults(shown, 'queue').map((node) => node.name)).toEqual([
      'QueueController',
      'QueueService',
      'MyQueueService',
      'Other',
    ]);
  });
});

describe('the count in the footer', () => {
  test('the graph holds core targets on top of the components, which are what the sidebar counts', () => {
    expect(graph.nodes.length).toBe(large.components.length + 5);
    expect(viewCount('graph', large)).toBe(large.components.length);
    expect(graphCountLabel(graph, graph.nodes)).toBe(
      `${large.components.length} of ${large.components.length} components · 5 of 5 core services`,
    );
  });

  test('says nothing of core services when the app has none', () => {
    const plain = {
      ...large,
      routes: [],
      components: large.components.filter((item) => item.name.startsWith('Service')),
    };
    const nodes = buildFullGraph(plain).nodes;

    expect(graphCountLabel({ nodes, edges: [] }, nodes.slice(0, 2))).toBe('2 of 40 components');
  });

  test('one of a thing is singular', () => {
    const nodes = [
      { id: 'a', name: 'A', kind: 'SERVICE' },
      { id: 'b', name: 'B', kind: 'CORE' },
    ] as unknown as Parameters<typeof graphCountLabel>[1];

    expect(graphCountLabel({ nodes, edges: [] }, nodes)).toBe('1 of 1 component · 1 of 1 core service');
  });

  test('a group counts as the members it stands for, in the column they belong to', () => {
    const shown = focusGraph(graph, { focusId: big, hidden: none, expanded: noGroups }).nodes;

    expect(graphCountLabel(graph, shown)).toBe(`11 of ${large.components.length} components · 5 of 5 core services`);
  });
});

describe('the full view of a large app', () => {
  test('opens with nothing picked, so every edge starts quiet', () => {
    const pick = openingPick(graph, true);
    const shown = filterGraph(graph, { hidden: defaultHiddenInFull(true), search: '' });
    const visible = new Set(shown.nodes.map((node) => node.id));
    const lit = new Set(pick === null ? [] : [pick]);
    const states = new Set(shown.edges.map((edge) => edgeState(edge, visible, { lit, quiet: true })));

    expect(pick).toBe(null);
    expect(states).toEqual(new Set(['quiet']));
  });

  test('a small app still opens on its first selection', () => {
    const small = buildFullGraph(fixture);

    expect(openingPick(small, false)).toBe(firstSelection(small));
    expect(openingPick(small, false)).toBe(componentNodeId('ItemController'));
  });

  test('its edges carry no label; the original graph keeps them', () => {
    const plain = withoutEdgeLabels(graph);

    expect(plain.edges.some((edge) => edge.label !== undefined)).toBe(false);
    expect(graph.edges.some((edge) => edge.label !== undefined)).toBe(true);
    expect(plain.edges).toHaveLength(graph.edges.length);
  });
});
