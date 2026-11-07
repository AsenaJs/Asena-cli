import { KIND_STYLES, kindLabel } from '../ui/kinds';
import {
  chipKindOf,
  GRAPH_NODE_KINDS,
  type Graph,
  type GraphChipKind,
  type GraphEdge,
  type GraphGroupKey,
  type GraphNode,
  matches,
} from './buildGraph';

export const LARGE_APP_LIMIT = 40;

/** A group forms when more neighbours than this fall into it. */
export const GROUP_THRESHOLD = 3;

export type GraphView = 'focus' | 'full';

export type FitMode = 'all' | 'focus' | 'width';

/** The view the user picked, and on which side of the size limit the app was at that moment. */
export interface GraphViewChoice {
  view: GraphView;
  large: boolean;
}

export const isLargeApp = (componentCount: number): boolean => componentCount > LARGE_APP_LIMIT;

export const defaultView = (componentCount: number): GraphView => (isLargeApp(componentCount) ? 'focus' : 'full');

export const currentView = (choice: GraphViewChoice | null, componentCount: number): GraphView =>
  choice?.large === isLargeApp(componentCount) ? choice.view : defaultView(componentCount);

export const defaultHiddenInFull = (large: boolean): ReadonlySet<GraphChipKind> =>
  new Set<GraphChipKind>(large ? ['CORE', 'VALIDATOR'] : []);

export const fitModeFor = (view: GraphView, large: boolean): FitMode =>
  view === 'focus' ? 'focus' : large ? 'width' : 'all';

/** The first controller, or else the first node, preferring the nodes that have a neighbour. */
export const firstSelection = (graph: Graph): string | null => {
  const wired = new Set(
    graph.edges.filter((edge) => edge.source !== edge.target).flatMap((edge) => [edge.source, edge.target]),
  );
  const opening = (nodes: GraphNode[]) => nodes.find((node) => node.kind === 'CONTROLLER') ?? nodes[0];

  return (opening(graph.nodes.filter((node) => wired.has(node.id))) ?? opening(graph.nodes))?.id ?? null;
};

export const neighbourIds = (graph: Graph, id: string): Set<string> => {
  const ids = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  }

  ids.delete(id);

  return ids;
};

export const groupNodeId = (key: GraphGroupKey): string => `group:${key}`;

export const isGroupNode = (id: string): boolean => id.startsWith('group:');

export const groupKeyOf = (id: string): GraphGroupKey | null =>
  isGroupNode(id) ? (id.slice('group:'.length) as GraphGroupKey) : null;

const GROUPS: { key: GraphGroupKey; word: string; holds: (node: GraphNode) => boolean; kind: GraphNode['kind'] }[] = [
  { key: 'validators', word: 'validators', holds: (node) => node.validator, kind: 'MIDDLEWARE' },
  { key: 'core', word: 'core services', holds: (node) => node.kind === 'CORE', kind: 'CORE' },
];

/** A group edge says how many it stands for; elk also gives every labelled edge one more column, so it lines up. */
const mergedLabel = (kind: GraphEdge['kind'], count: number): string => {
  const word = kind === 'inject' || kind === 'strategy' ? 'field' : 'route';

  return `${count} ${word}${count === 1 ? '' : 's'}`;
};

export interface FocusOptions {
  focusId: string | null;
  hidden: ReadonlySet<GraphChipKind>;
  expanded: ReadonlySet<GraphGroupKey>;
}

/**
 * The focus and its direct neighbours, wired only to the focus: the edges among the neighbours are what makes the
 * whole graph a tangle, and the focus moves there with one click. The chips never hide the focus itself.
 */
export const focusGraph = (graph: Graph, { focusId, hidden, expanded }: FocusOptions): Graph => {
  const focus = graph.nodes.find((node) => node.id === focusId);

  if (!focus) return { nodes: [], edges: [] };

  const ids = neighbourIds(graph, focus.id);
  const neighbours = graph.nodes.filter((node) => ids.has(node.id) && !hidden.has(chipKindOf(node)));
  const groupOf = new Map<string, string>();
  const groups: GraphNode[] = [];

  for (const { key, word, holds, kind } of GROUPS) {
    const members = neighbours.filter(holds);

    if (members.length <= GROUP_THRESHOLD || expanded.has(key)) continue;

    const id = groupNodeId(key);

    for (const member of members) groupOf.set(member.id, id);

    groups.push({
      id,
      name: `${members.length} ${word}`,
      kind,
      matched: false,
      validator: false,
      group: { key, members: members.map((member) => member.id) },
    });
  }

  const shown = new Set([focus.id, ...neighbours.map((node) => node.id)]);
  const edges = new Map<string, GraphEdge>();
  const merged = new Map<string, number>();

  for (const edge of graph.edges) {
    if (edge.source !== focus.id && edge.target !== focus.id) continue;
    if (!shown.has(edge.source) || !shown.has(edge.target)) continue;

    const source = groupOf.get(edge.source);
    const target = groupOf.get(edge.target);

    if (source === undefined && target === undefined) {
      edges.set(edge.id, edge);
      continue;
    }

    const id = `${edge.kind}:${source ?? edge.source}->${target ?? edge.target}`;
    const count = (merged.get(id) ?? 0) + 1;

    merged.set(id, count);
    edges.set(id, {
      id,
      source: source ?? edge.source,
      target: target ?? edge.target,
      kind: edge.kind,
      label: mergedLabel(edge.kind, count),
    });
  }

  return {
    nodes: [focus, ...neighbours.filter((node) => !groupOf.has(node.id)), ...groups],
    edges: [...edges.values()],
  };
};

/** Every node matching the query, whichever view it is in: names starting with it first, then by name. */
export const searchResults = (graph: Graph, search: string): GraphNode[] => {
  const query = search.trim().toLowerCase();

  if (query === '') return [];

  const rank = (node: GraphNode) => {
    const name = node.name.toLowerCase();

    return name.startsWith(query) ? 0 : name.includes(query) ? 1 : 2;
  };

  return graph.nodes
    .filter((node) => matches(node, query))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

export type EdgeState = 'dim' | 'active' | 'idle' | 'quiet' | 'faded';

export interface EdgeEmphasis {
  /** The nodes that show their own edges: the hovered and the selected one. */
  lit: ReadonlySet<string>;
  /** The Full view of a large app, where edges only speak when asked. */
  quiet: boolean;
}

export const edgeState = (
  edge: Pick<GraphEdge, 'source' | 'target'>,
  visible: ReadonlySet<string>,
  { lit, quiet }: EdgeEmphasis,
): EdgeState => {
  if (!visible.has(edge.source) || !visible.has(edge.target)) return quiet ? 'faded' : 'dim';
  if (lit.has(edge.source) || lit.has(edge.target)) return 'active';
  if (!quiet) return 'idle';

  return lit.size > 0 ? 'faded' : 'quiet';
};

/**
 * What the graph's footer says. A dependency target no component provides is a node as well, so the graph can hold more
 * nodes than the app has components; they are counted apart, and `components` stays the count the sidebar shows.
 */
export const graphCountLabel = (all: Graph, shown: GraphNode[]): string => {
  const size = (node: GraphNode) => node.group?.members.length ?? 1;
  const count = (nodes: GraphNode[], core: boolean) =>
    nodes.filter((node) => (node.kind === 'CORE') === core).reduce((total, node) => total + size(node), 0);
  const label = (core: boolean, noun: string) => {
    const total = count(all.nodes, core);

    return `${count(shown, core)} of ${total} ${noun}${total === 1 ? '' : 's'}`;
  };
  const components = label(false, 'component');

  return count(all.nodes, true) === 0 ? components : `${components} · ${label(true, 'core service')}`;
};

export const withoutEdgeLabels = (graph: Graph): Graph => ({
  nodes: graph.nodes,
  edges: graph.edges.map(({ label: _label, ...edge }) => edge),
});

export interface KindChip {
  id: GraphChipKind;
  label: string;
  color: string;
  /** What the chip switches together. */
  keys: GraphChipKind[];
}

/**
 * One chip per kind present. A large app splits the validators off middleware so that they can start hidden on
 * their own; a small app keeps the one Middleware chip, covering both.
 */
export const kindChips = (graph: Graph, large: boolean): KindChip[] => {
  const present = new Set(graph.nodes.map(large ? chipKindOf : (node) => node.kind));
  const chips: KindChip[] = [];

  for (const kind of GRAPH_NODE_KINDS) {
    if (present.has(kind)) {
      chips.push({
        id: kind,
        label: kindLabel(kind),
        color: KIND_STYLES[kind].color,
        keys: kind === 'MIDDLEWARE' && !large ? ['MIDDLEWARE', 'VALIDATOR'] : [kind],
      });
    }

    if (kind === 'MIDDLEWARE' && large && present.has('VALIDATOR')) {
      chips.push({ id: 'VALIDATOR', label: 'Validator', color: KIND_STYLES.MIDDLEWARE.color, keys: ['VALIDATOR'] });
    }
  }

  return chips;
};
