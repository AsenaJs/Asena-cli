import type { ElkNode } from 'elkjs/lib/elk-api';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Graph } from './buildGraph';
import { type Lane, LANES, laneOf } from './lanes';

export const NODE_WIDTH = 240;

export const NODE_HEIGHT = 58;

export const LABEL_HEIGHT = 18;

export interface Position {
  x: number;
  y: number;
}

export interface EdgeRoute {
  /** From the source's side to the target's side, bends in between. */
  points: Position[];
  /** The centre of the label pill. */
  label?: Position;
}

export interface LaneHeading {
  lane: Lane;
  label: string;
  x: number;
}

export interface GraphLayout {
  nodes: Map<string, Position>;
  /** Empty for the grid fallback, where edges are drawn between the handles. */
  edges: Map<string, EdgeRoute>;
  lanes: LaneHeading[];
}

/** The pill width for a label, in the mockup's 10.5px mono with 7px padding. */
export const labelWidth = (text: string): number => Math.ceil(text.length * 6.4 + 16);

let elk: InstanceType<typeof ELK> | null = null;

/** The wired nodes first, most connected on top, so the components without edges collect at the bottom. */
const byDegree = (graph: Graph) => {
  const degree = new Map<string, number>();

  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  return [...graph.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
};

const headings = (graph: Graph, nodes: Map<string, Position>): LaneHeading[] =>
  LANES.flatMap((label, lane) => {
    const xs = graph.nodes.filter((node) => laneOf(node) === lane).map((node) => nodes.get(node.id)?.x ?? 0);

    return xs.length === 0 ? [] : [{ lane: lane as Lane, label, x: Math.min(...xs) }];
  });

/**
 * Left-to-right layered layout in three ordered partitions, one per lane. Edge labels are laid out by elk as
 * well, at the middle of their edge, so a label never sits on a node.
 */
export const layoutGraph = async (graph: Graph): Promise<GraphLayout> => {
  elk ??= new ELK();

  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.partitioning.activate': 'true',
      // Packing unconnected parts side by side would ignore the lanes.
      'elk.separateConnectedComponents': 'false',
      // Sources first, so an entry point without edges sits in its lane's first column.
      'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '26',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.spacing.edgeLabel': '4',
      'elk.edgeLabels.inline': 'true',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: byDegree(graph).map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: { 'elk.partitioning.partition': String(laneOf(node)) },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      labels:
        edge.label === undefined
          ? []
          : [
              {
                text: edge.label,
                width: labelWidth(edge.label),
                height: LABEL_HEIGHT,
                layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' },
              },
            ],
    })),
  };
  const result = await elk.layout(input);

  const nodes = new Map((result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
  const edges = new Map<string, EdgeRoute>();

  for (const edge of result.edges ?? []) {
    const points = (edge.sections ?? []).flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    const label = edge.labels?.[0];

    edges.set(edge.id, {
      points,
      ...(label
        ? { label: { x: (label.x ?? 0) + (label.width ?? 0) / 2, y: (label.y ?? 0) + (label.height ?? 0) / 2 } }
        : {}),
    });
  }

  return { nodes, edges, lanes: headings(graph, nodes) };
};

/** A plain grid by lane, used until the layout resolves and by the server-rendered tests. */
export const gridLayout = (graph: Graph): GraphLayout => {
  const rows = [0, 0, 0];
  const nodes = new Map<string, Position>();

  for (const node of graph.nodes) {
    const lane = laneOf(node);
    const row = rows[lane] ?? 0;

    nodes.set(node.id, { x: lane * (NODE_WIDTH + 120), y: row * (NODE_HEIGHT + 32) });
    rows[lane] = row + 1;
  }

  return { nodes, edges: new Map(), lanes: headings(graph, nodes) };
};

const GRID_COLUMN_GAP = 24;

const GRID_ROW_GAP = 22;

const GRID_LANE_GAP = 72;

// A landscape overview, as wide as a canvas is at the usual window sizes.
const GRID_ASPECT = 1.5;

// As many as a 1440 px window's canvas shows whole at the 35% floor, so that no lane starts off screen.
const MAX_GRID_COLUMNS = 7;

/** The columns for `count` nodes in `lanes` lanes; a lane cannot have less than one. */
export const gridColumns = (count: number, lanes: number): number => {
  const ideal = Math.sqrt((GRID_ASPECT * count * (NODE_HEIGHT + GRID_ROW_GAP)) / (NODE_WIDTH + GRID_COLUMN_GAP));

  return Math.max(lanes, Math.min(Math.round(ideal), MAX_GRID_COLUMNS));
};

/** Shares `columns` out so that the tallest lane is as short as it can be; an empty lane gets none. */
export const laneColumns = (counts: readonly number[], columns: number): number[] => {
  const shares: number[] = counts.map((count) => (count > 0 ? 1 : 0));
  const rows = (lane: number) => Math.ceil((counts[lane] ?? 0) / (shares[lane] || 1));
  let left = columns - shares.reduce((total, share) => total + share, 0);

  while (left > 0) {
    const widenable = shares.flatMap((share, lane) => (share > 0 && share < (counts[lane] ?? 0) ? [lane] : []));
    const tallest = widenable.reduce((best, lane) => (rows(lane) > rows(best) ? lane : best), widenable[0] ?? -1);

    if (tallest === -1) break;

    shares[tallest] = (shares[tallest] ?? 0) + 1;
    left--;
  }

  return shares;
};

/**
 * Each lane as a block of columns, most connected on top. A layered layout gives a lane one column per step of the
 * longest dependency chain in it, which on a large app runs off the canvas at any zoom worth reading.
 */
export const laneGridLayout = (graph: Graph): GraphLayout => {
  const members = LANES.map((_, lane) => byDegree(graph).filter((node) => laneOf(node) === lane));
  const counts = members.map((lane) => lane.length);
  const used = counts.filter((count) => count > 0).length;
  const shares = laneColumns(counts, gridColumns(graph.nodes.length, used));
  const nodes = new Map<string, Position>();
  let left = 0;

  members.forEach((lane, index) => {
    const columns = shares[index] ?? 0;

    lane.forEach((node, position) => {
      nodes.set(node.id, {
        x: left + (position % columns) * (NODE_WIDTH + GRID_COLUMN_GAP),
        y: Math.floor(position / columns) * (NODE_HEIGHT + GRID_ROW_GAP),
      });
    });

    if (columns > 0) left += columns * (NODE_WIDTH + GRID_COLUMN_GAP) - GRID_COLUMN_GAP + GRID_LANE_GAP;
  });

  return { nodes, edges: new Map(), lanes: headings(graph, nodes) };
};

/** An orthogonal polyline as an SVG path with rounded corners. */
export const roundedPath = (points: Position[], radius = 8): string => {
  const [first, ...rest] = points;

  if (!first) return '';

  let path = `M${first.x} ${first.y}`;

  for (let i = 0; i < rest.length; i++) {
    const corner = rest[i];
    const next = rest[i + 1];

    if (!next) {
      path += ` L${corner.x} ${corner.y}`;
      break;
    }

    const prev = i === 0 ? first : rest[i - 1];
    const r = Math.min(
      radius,
      Math.hypot(corner.x - prev.x, corner.y - prev.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2,
    );
    const toward = (from: Position, to: Position, distance: number): Position => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;

      return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
    };
    const before = toward(corner, prev, r);
    const after = toward(corner, next, r);

    path += ` L${before.x} ${before.y} Q${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }

  return path;
};
