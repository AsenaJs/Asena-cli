import {
  applyNodeChanges,
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeProps,
  Position as HandlePosition,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DevtoolsSnapshot } from '../../lib/console/protocol';
import type { ThemeChoice } from '../shell/theme';
import {
  buildFullGraph,
  filterGraph,
  GRAPH_NODE_KINDS,
  type Graph,
  type GraphNode,
  type GraphNodeKind,
} from './buildGraph';
import { ComponentDetails, kindLabel } from './ComponentDetails';
import { gridLayout, layoutGraph, NODE_HEIGHT, NODE_WIDTH, type Position } from './layout';

type FlowNode = Node<{ node: GraphNode }, 'component'>;

const ComponentNode = ({ data }: NodeProps<FlowNode>) => (
  <div className="graph-node" data-kind={data.node.kind} data-matched={data.node.matched ? 'true' : undefined}>
    <Handle type="target" position={HandlePosition.Left} isConnectable={false} />
    <span className="graph-node-name">{data.node.name}</span>
    <span className="graph-node-kind">{kindLabel(data.node.kind)}</span>
    <Handle type="source" position={HandlePosition.Right} isConnectable={false} />
  </div>
);

const NODE_TYPES = { component: ComponentNode };

const toFlowNodes = (graph: Graph, positions: Map<string, Position>, selectedId: string | null): FlowNode[] =>
  graph.nodes.map((node) => ({
    id: node.id,
    type: 'component',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    selected: node.id === selectedId,
    connectable: false,
    ariaLabel: `${kindLabel(node.kind)} ${node.name}`,
    data: { node },
  }));

const toFlowEdges = (graph: Graph): Edge[] =>
  graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    className: `graph-edge graph-edge-${edge.kind}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    ...(edge.label === undefined ? {} : { label: edge.label }),
  }));

export interface GraphPanelProps {
  snapshot: DevtoolsSnapshot;
  theme: ThemeChoice;
  onOpenRoute: (key: string) => void;
}

const GraphView = ({ snapshot, theme, onOpenRoute }: GraphPanelProps) => {
  const [hidden, setHidden] = useState<ReadonlySet<GraphNodeKind>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const full = useMemo(() => buildFullGraph(snapshot), [snapshot]);
  const graph = useMemo(() => filterGraph(full, { hidden, search }), [full, hidden, search]);
  const [positions, setPositions] = useState<Map<string, Position>>(() => gridLayout(graph));
  const [nodes, setNodes] = useState<FlowNode[]>(() => toFlowNodes(graph, positions, selectedId));
  const edges = useMemo(() => toFlowEdges(graph), [graph]);
  const { fitView } = useReactFlow<FlowNode>();
  const pendingFit = useRef(false);
  const presentKinds = GRAPH_NODE_KINDS.filter((kind) => full.nodes.some((node) => node.kind === kind));
  const selected = full.nodes.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;

    layoutGraph(graph)
      .then((layout) => {
        if (!cancelled) setPositions(layout);
      })
      .catch((error: unknown) => {
        console.warn('[asena console] graph layout failed, keeping the grid', error);
      });

    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    setNodes(toFlowNodes(graph, positions, selectedId));
    pendingFit.current = true;
    // Selection is applied by the effect below, so a click does not reset dragged nodes.
  }, [graph, positions]);

  // Fitting before React Flow holds the new nodes would fit the previous layout.
  useEffect(() => {
    if (!pendingFit.current) return;

    pendingFit.current = false;
    void fitView({ padding: 0.1 });
  }, [nodes, fitView]);

  useEffect(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === selectedId })));
  }, [selectedId]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));

    const selections = changes.filter((change) => change.type === 'select');
    const picked = selections.find((change) => change.selected);

    if (picked) {
      setSelectedId(picked.id);
    } else if (selections.length > 0) {
      setSelectedId(null);
    }
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
    <section className="panel graph-panel" aria-labelledby="graph-title">
      <div className="graph-toolbar">
        <h2 id="graph-title">Component graph</h2>
        <input
          type="search"
          placeholder="Search components"
          aria-label="Search components"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <fieldset className="kind-filter">
          <legend className="visually-hidden">Show component types</legend>
          {presentKinds.map((kind) => (
            <label key={kind} className="kind-toggle" data-kind={kind}>
              <input type="checkbox" checked={!hidden.has(kind)} onChange={() => toggleKind(kind)} />
              <span className="kind-swatch" aria-hidden="true" />
              {kindLabel(kind)}
            </label>
          ))}
        </fieldset>
        <span className="muted" aria-live="polite">
          {graph.nodes.length} of {full.nodes.length} nodes
        </span>
      </div>
      <ul className="edge-legend" aria-label="Edge kinds">
        <li data-edge="inject">inject</li>
        <li data-edge="soft">soft (middleware)</li>
        <li data-edge="strategy">strategy</li>
        <li data-edge="validator">route validator</li>
        <li data-edge="global-middleware">global middleware</li>
      </ul>
      <div className="graph-body">
        <div className="graph-canvas">
          <ReactFlow<FlowNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            colorMode={theme}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            minZoom={0.1}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selected ? (
          <ComponentDetails
            snapshot={snapshot}
            graph={full}
            node={selected}
            onSelect={setSelectedId}
            onOpenRoute={onOpenRoute}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </section>
  );
};

export const GraphPanel = (props: GraphPanelProps) => (
  <ReactFlowProvider>
    <GraphView {...props} />
  </ReactFlowProvider>
);
