import {
  Background,
  BackgroundVariant,
  Controls,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DevtoolsSnapshot } from '../../lib/console/protocol';
import type { ThemeChoice } from '../shell/theme';
import { Card, Chip, SearchField } from '../ui/components';
import { KIND_STYLES, kindLabel } from '../ui/kinds';
import { buildFullGraph, filterGraph, GRAPH_NODE_KINDS, type Graph, type GraphNodeKind } from './buildGraph';
import {
  ComponentNode,
  type FlowNode,
  LaneNode,
  type LaneFlowNode,
  RoutedEdge,
  type RoutedFlowEdge,
} from './FlowParts';
import { Inspector } from './Inspector';
import { nodeMeta } from './lanes';
import { type GraphLayout, gridLayout, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from './layout';

const NODE_TYPES = { component: ComponentNode, lane: LaneNode };

const EDGE_TYPES = { routed: RoutedEdge };

const LANE_OFFSET = 34;

const VIEW_PADDING = 24;

const MIN_START_ZOOM = 0.6;

/** The box the nodes and lane headings take up. */
const layoutBounds = (layout: GraphLayout) => {
  const positions = [...layout.nodes.values()];
  const x = Math.min(0, ...positions.map((position) => position.x));
  const y = Math.min(0, ...positions.map((position) => position.y)) - LANE_OFFSET;
  const right = Math.max(NODE_WIDTH, ...positions.map((position) => position.x + NODE_WIDTH));
  const bottom = Math.max(NODE_HEIGHT, ...positions.map((position) => position.y + NODE_HEIGHT));

  return { x, y, width: right - x, height: bottom - y };
};

export const toFlowNodes = (
  snapshot: DevtoolsSnapshot,
  graph: Graph,
  layout: GraphLayout,
  visible: ReadonlySet<string>,
  selectedId: string | null,
): FlowNode[] => {
  const top = Math.min(0, ...[...layout.nodes.values()].map((position) => position.y));
  const lanes: LaneFlowNode[] = layout.lanes.map((lane) => ({
    id: `lane:${lane.lane}`,
    type: 'lane',
    position: { x: lane.x, y: top - LANE_OFFSET },
    selectable: false,
    draggable: false,
    focusable: false,
    data: { label: lane.label },
  }));

  return [
    ...lanes,
    ...graph.nodes.map((node): FlowNode => ({
      id: node.id,
      type: 'component',
      position: layout.nodes.get(node.id) ?? { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      selected: node.id === selectedId,
      draggable: false,
      connectable: false,
      ariaLabel: `${kindLabel(node.kind)} ${node.name}`,
      data: { node, meta: nodeMeta(snapshot, node), dim: !visible.has(node.id) },
    })),
  ];
};

export const toFlowEdges = (
  graph: Graph,
  layout: GraphLayout,
  visible: ReadonlySet<string>,
  selectedId: string | null,
): RoutedFlowEdge[] =>
  graph.edges.map((edge) => {
    const route = layout.edges.get(edge.id);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'routed',
      focusable: false,
      selectable: false,
      zIndex: edge.source === selectedId || edge.target === selectedId ? 1 : 0,
      data: {
        kind: edge.kind,
        ...(edge.label === undefined ? {} : { label: edge.label }),
        ...(route ? { route } : {}),
        active: edge.source === selectedId || edge.target === selectedId,
        dim: !visible.has(edge.source) || !visible.has(edge.target),
      },
    };
  });

export interface GraphPanelProps {
  snapshot: DevtoolsSnapshot;
  theme: ThemeChoice;
  onOpenRoute: (key: string) => void;
}

const firstEntryPoint = (graph: Graph): string | null =>
  (graph.nodes.find((node) => node.kind === 'CONTROLLER') ?? graph.nodes[0])?.id ?? null;

const Legend = () => (
  <ul className="legend" aria-label="Edge kinds">
    <li>
      <svg viewBox="0 0 26 8" aria-hidden="true">
        <path d="M0 4h26" className="legend-inject" />
      </svg>
      injects
    </li>
    <li>
      <svg viewBox="0 0 26 8" aria-hidden="true">
        <path d="M0 4h26" className="legend-strategy" />
      </svg>
      injects every implementation
    </li>
    <li>
      <svg viewBox="0 0 26 8" aria-hidden="true">
        <path d="M0 4h26" className="legend-guard" />
      </svg>
      guarded by middleware or validator
    </li>
    <li>
      <svg viewBox="0 0 26 8" aria-hidden="true">
        <path d="M0 4h26" className="legend-global" />
      </svg>
      applies globally
    </li>
  </ul>
);

const GraphView = ({ snapshot, theme, onOpenRoute }: GraphPanelProps) => {
  const full = useMemo(() => buildFullGraph(snapshot), [snapshot]);
  const [hidden, setHidden] = useState<ReadonlySet<GraphNodeKind>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => firstEntryPoint(full));
  const [layout, setLayout] = useState<GraphLayout>(() => gridLayout(full));
  const visible = useMemo(
    () => new Set(filterGraph(full, { hidden, search }).nodes.map((node) => node.id)),
    [full, hidden, search],
  );
  const nodes = useMemo(
    () => toFlowNodes(snapshot, full, layout, visible, selectedId),
    [snapshot, full, layout, visible, selectedId],
  );
  const edges = useMemo(() => toFlowEdges(full, layout, visible, selectedId), [full, layout, visible, selectedId]);
  const { setViewport } = useReactFlow<FlowNode>();
  const pendingFit = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const presentKinds = GRAPH_NODE_KINDS.filter((kind) => full.nodes.some((node) => node.kind === kind));
  const selected = full.nodes.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;

    layoutGraph(full)
      .then((next) => {
        if (cancelled) return;

        pendingFit.current = true;
        setLayout(next);
      })
      .catch((error: unknown) => {
        console.warn('[asena console] graph layout failed, keeping the grid', error);
      });

    return () => {
      cancelled = true;
    };
  }, [full]);

  // Fitting before React Flow holds the new positions would fit the previous layout. The lanes are fitted to the
  // width and shown from the top; a tall app scrolls instead of shrinking, and the fit button shows everything.
  useEffect(() => {
    const element = canvas.current;

    if (!pendingFit.current || !element) return;

    pendingFit.current = false;

    const bounds = layoutBounds(layout);
    const width = element.clientWidth - VIEW_PADDING * 2;
    const height = element.clientHeight - VIEW_PADDING * 2;
    const fit = width / bounds.width;
    const zoom = Math.min(1, Math.max(MIN_START_ZOOM, fit));

    void setViewport({
      x: VIEW_PADDING - bounds.x * zoom + Math.max(0, (width - bounds.width * zoom) / 2),
      y: VIEW_PADDING - bounds.y * zoom + Math.max(0, (height - bounds.height * zoom) / 2),
      zoom,
    });
  }, [nodes, layout, setViewport]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const picked = changes.find((change) => change.type === 'select' && change.selected);

    if (picked && 'id' in picked && !picked.id.startsWith('lane:')) setSelectedId(picked.id);
  }, []);

  const toggleKind = (kind: GraphNodeKind) => {
    const next = new Set(hidden);

    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }

    setHidden(next);
  };

  return (
    <div className="graph-layout">
      <Card className="graph-card">
        <div className="graph-tools">
          <SearchField label="Find a component" value={search} onChange={setSearch} />
          <div className="chips" role="group" aria-label="Show component types">
            {presentKinds.map((kind) => (
              <Chip
                key={kind}
                pressed={!hidden.has(kind)}
                color={KIND_STYLES[kind].color}
                onToggle={() => toggleKind(kind)}
              >
                {kindLabel(kind)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="canvas-wrap" ref={canvas}>
          <ReactFlow<FlowNode, RoutedFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              if (node.type === 'component') setSelectedId(node.id);
            }}
            colorMode={theme}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={1.6}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <div className="graph-foot">
          <Legend />
          <span className="muted graph-count" aria-live="polite">
            {visible.size} of {full.nodes.length} components
          </span>
        </div>
      </Card>
      <Inspector snapshot={snapshot} graph={full} node={selected} onSelect={setSelectedId} onOpenRoute={onOpenRoute} />
    </div>
  );
};

export const GraphPanel = (props: GraphPanelProps) => (
  <ReactFlowProvider>
    <GraphView {...props} />
  </ReactFlowProvider>
);
