import ELK from 'elkjs/lib/elk.bundled.js';
import type { Graph } from './buildGraph';

export const NODE_WIDTH = 200;

export const NODE_HEIGHT = 52;

export interface Position {
  x: number;
  y: number;
}

let elk: InstanceType<typeof ELK> | null = null;

/** Left-to-right layered layout: a component sits left of what it depends on. */
export const layoutGraph = async (graph: Graph): Promise<Map<string, Position>> => {
  elk ??= new ELK();

  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.separateConnectedComponents': 'true',
    },
    children: graph.nodes.map((node) => ({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: graph.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });

  return new Map((result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
};

/** A plain grid, used until the layout resolves and by the server-rendered tests. */
export const gridLayout = (graph: Graph, columns = 4): Map<string, Position> =>
  new Map(
    graph.nodes.map((node, i) => [
      node.id,
      { x: (i % columns) * (NODE_WIDTH + 40), y: Math.floor(i / columns) * (NODE_HEIGHT + 32) },
    ]),
  );
