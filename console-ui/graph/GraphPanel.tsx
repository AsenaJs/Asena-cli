import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { type FocusEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DevtoolsSnapshot } from '../../lib/console/protocol';
import type { ThemeChoice } from '../shell/theme';
import { Card, Chip, Glyph, List, SearchField, SegmentedControl } from '../ui/components';
import { kindLabel } from '../ui/kinds';
import { buildFullGraph, filterGraph, type Graph, type GraphChipKind, type GraphGroupKey } from './buildGraph';
import {
  ComponentNode,
  type FlowNode,
  LaneNode,
  type LaneFlowNode,
  RoutedEdge,
  type RoutedFlowEdge,
} from './FlowParts';
import {
  currentView,
  defaultHiddenInFull,
  type FitMode,
  firstSelection,
  fitModeFor,
  focusGraph,
  type GraphView,
  type GraphViewChoice,
  groupKeyOf,
  isLargeApp,
  kindChips,
  searchResults,
  withoutEdgeLabels,
} from './focus';
import { Inspector } from './Inspector';
import { nodeMeta } from './lanes';
import { type GraphLayout, gridLayout, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from './layout';

const NODE_TYPES = { component: ComponentNode, lane: LaneNode };

const EDGE_TYPES = { routed: RoutedEdge };

const LANE_OFFSET = 34;

const VIEW_PADDING = 24;

const CONTROLS_GUTTER = 36;

const MIN_ZOOM = 0.15;

const FOCUS_FIT_FLOOR = 0.6;

const FULL_FIT_FLOOR = 0.35;

// Below this a node's 13.5px name is too small to read, so a large app's nodes switch to their name alone, enlarged.
const FAR_ZOOM = 0.55;

const FIT_BUTTON_OPTIONS = { padding: 0.08, maxZoom: 1 };

const NO_KINDS: ReadonlySet<GraphChipKind> = new Set();

const NO_GROUPS: ReadonlySet<GraphGroupKey> = new Set();

const VIEW_OPTIONS: { id: GraphView; label: string }[] = [
  { id: 'focus', label: 'Focus' },
  { id: 'full', label: 'Full' },
];

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The viewport that shows all of `bounds`, centred, in a canvas of `width` x `height`; never above 100% or below
 * `floor`. Whatever overflows at the floor starts at the top left, for the user to pan to.
 */
export const fitViewport = (bounds: Bounds, width: number, height: number, floor = MIN_ZOOM) => {
  const innerWidth = width - VIEW_PADDING * 2;
  const innerHeight = height - VIEW_PADDING * 2;
  const fit = Math.min(innerWidth / bounds.width, innerHeight / bounds.height);
  const zoom = Math.min(1, Math.max(floor, fit));

  return {
    x: VIEW_PADDING - bounds.x * zoom + Math.max(0, (innerWidth - bounds.width * zoom) / 2),
    y: VIEW_PADDING - bounds.y * zoom + Math.max(0, (innerHeight - bounds.height * zoom) / 2),
    zoom,
  };
};

/**
 * The viewport that fits the width alone, down to the floor, always starting from the top. The left gutter keeps the
 * first lane clear of the zoom controls, since this graph is tall enough to run behind them.
 */
export const widthFitViewport = (bounds: Bounds, width: number) => {
  const left = VIEW_PADDING + CONTROLS_GUTTER;
  const innerWidth = width - VIEW_PADDING - left;
  const zoom = Math.min(1, Math.max(FULL_FIT_FLOOR, innerWidth / bounds.width));

  return {
    x: left - bounds.x * zoom + Math.max(0, (innerWidth - bounds.width * zoom) / 2),
    y: VIEW_PADDING - bounds.y * zoom,
    zoom,
  };
};

export const viewportFor = (mode: FitMode, bounds: Bounds, width: number, height: number) => {
  if (mode === 'width') return widthFitViewport(bounds, width);

  return fitViewport(bounds, width, height, mode === 'focus' ? FOCUS_FIT_FLOOR : MIN_ZOOM);
};

/** The box the nodes and lane headings take up. */
export const layoutBounds = (layout: GraphLayout): Bounds => {
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
      ariaLabel: node.group ? `${node.name}, expand` : `${kindLabel(node.kind)} ${node.name}`,
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
  /** Lives in the shell: the panel unmounts on every switch and the choice holds until the page reloads. */
  viewChoice: GraphViewChoice | null;
  onViewChoice: (choice: GraphViewChoice | null) => void;
  onOpenRoute: (key: string) => void;
}

/** What is on the canvas: a graph with the layout made for it, so a node never shows at another graph's position. */
interface Rendered {
  graph: Graph;
  layout: GraphLayout;
  view: GraphView;
  fit: FitMode;
}

const FitIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden="true">
    <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
  </svg>
);

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

const GraphCanvasView = ({ snapshot, theme, viewChoice, onViewChoice, onOpenRoute }: GraphPanelProps) => {
  const full = useMemo(() => buildFullGraph(snapshot), [snapshot]);
  const count = snapshot.components.length;
  const large = isLargeApp(count);
  const view = currentView(viewChoice, count);
  const [hiddenInFocus, setHiddenInFocus] = useState<ReadonlySet<GraphChipKind>>(NO_KINDS);
  const [hiddenInFull, setHiddenInFull] = useState(() => defaultHiddenInFull(large));
  const [sizeSeen, setSizeSeen] = useState(large);
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(() => firstSelection(full));
  const [expanded, setExpanded] = useState(NO_GROUPS);

  if (sizeSeen !== large) {
    setSizeSeen(large);
    setHiddenInFocus(NO_KINDS);
    setHiddenInFull(defaultHiddenInFull(large));
  }

  useEffect(() => {
    if (viewChoice && viewChoice.large !== large) onViewChoice(null);
  }, [viewChoice, large, onViewChoice]);

  const hidden = view === 'focus' ? hiddenInFocus : hiddenInFull;
  const selected =
    full.nodes.find((node) => node.id === pickedId) ??
    (view === 'focus' ? full.nodes.find((node) => node.id === firstSelection(full)) : undefined) ??
    null;
  const selectedId = selected?.id ?? null;
  const focusId = view === 'focus' ? selectedId : null;
  const shown = useMemo(() => {
    if (view === 'focus') return focusGraph(full, { focusId, hidden, expanded });

    return large ? withoutEdgeLabels(filterGraph(full, { hidden, search: '' })) : full;
  }, [view, full, focusId, hidden, expanded, large]);
  const fitMode = fitModeFor(view, large);
  const [rendered, setRendered] = useState<Rendered>(() => ({
    graph: shown,
    layout: gridLayout(shown),
    view,
    fit: fitMode,
  }));
  const visible = useMemo(() => {
    const inFocus = rendered.view === 'focus';
    const filter = { hidden: inFocus ? NO_KINDS : hiddenInFull, search: inFocus ? '' : search };

    return new Set(filterGraph(rendered.graph, filter).nodes.map((node) => node.id));
  }, [rendered, hiddenInFull, search]);
  const nodes = useMemo(
    () => toFlowNodes(snapshot, rendered.graph, rendered.layout, visible, selectedId),
    [snapshot, rendered, visible, selectedId],
  );
  const edges = useMemo(
    () => toFlowEdges(rendered.graph, rendered.layout, visible, selectedId),
    [rendered, visible, selectedId],
  );
  const { setViewport } = useReactFlow<FlowNode>();
  const far = useStore((store) => store.transform[2] < FAR_ZOOM);
  const [ready, setReady] = useState(false);
  const pendingFit = useRef(true);
  const userMoved = useRef(false);
  const onCanvas = useRef(rendered);
  const canvas = useRef<HTMLDivElement>(null);
  const chips = useMemo(() => kindChips(full, large), [full, large]);
  const results = view === 'focus' ? searchResults(full, search) : [];
  const shownCount = rendered.graph.nodes
    .filter((node) => visible.has(node.id))
    .reduce((total, node) => total + (node.group?.members.length ?? 1), 0);

  onCanvas.current = rendered;

  // A canvas not laid out yet (0 x 0) keeps the fit pending until the resize observer reports a size.
  const fit = useCallback(() => {
    const element = canvas.current;

    if (!element || element.clientWidth === 0 || element.clientHeight === 0) return;

    pendingFit.current = false;
    void setViewport(
      viewportFor(
        onCanvas.current.fit,
        layoutBounds(onCanvas.current.layout),
        element.clientWidth,
        element.clientHeight,
      ),
    );
  }, [setViewport]);

  useEffect(() => {
    let cancelled = false;
    const show = (layout: GraphLayout) => {
      pendingFit.current = true;
      userMoved.current = false;
      setRendered({ graph: shown, layout, view, fit: fitMode });
    };

    layoutGraph(shown)
      .then((next) => {
        if (!cancelled) show(next);
      })
      .catch((error: unknown) => {
        console.warn('[asena console] graph layout failed, keeping the grid', error);
        if (!cancelled) show(gridLayout(shown));
      });

    return () => {
      cancelled = true;
    };
  }, [shown, view, fitMode]);

  // React Flow drops a viewport set before its pan-zoom is initialised, hence `ready`.
  useEffect(() => {
    if (ready && pendingFit.current) fit();
  }, [ready, rendered, fit]);

  useEffect(() => {
    const element = canvas.current;

    if (!ready || !element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (pendingFit.current || !userMoved.current) fit();
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [ready, fit]);

  const select = (id: string) => {
    if (id === selectedId) return;

    setPickedId(id);
    setExpanded(NO_GROUPS);
  };

  const activate = (id: string) => {
    if (id.startsWith('lane:')) return;

    const group = groupKeyOf(id);

    if (group) {
      setExpanded((current) => new Set(current).add(group));
    } else {
      select(id);
    }
  };

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const picked = changes.find((change) => change.type === 'select' && change.selected);

    if (picked && 'id' in picked) activate(picked.id);
  };

  const toggleChip = (keys: GraphChipKind[]) => {
    const next = new Set(hidden);
    const show = keys.some((key) => next.has(key));

    for (const key of keys) {
      if (show) {
        next.delete(key);
      } else {
        next.add(key);
      }
    }

    if (view === 'focus') {
      setHiddenInFocus(next);
    } else {
      setHiddenInFull(next);
    }
  };

  const chooseResult = (id: string) => {
    select(id);
    setSearch('');
  };

  const onSearchKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setSearch('');
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && results[0]) chooseResult(results[0].id);
  };

  const onSearchBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (view === 'focus' && !event.currentTarget.contains(event.relatedTarget)) setSearch('');
  };

  return (
    <div className="graph-layout">
      <Card className="graph-card">
        <div className="graph-tools">
          <div className="graph-search" onKeyDown={onSearchKey} onBlur={onSearchBlur}>
            <SearchField label="Find a component" value={search} onChange={setSearch} />
            {view === 'focus' && search.trim() !== '' ? (
              <div className="graph-results" onMouseDown={(event) => event.preventDefault()}>
                {results.length > 0 ? (
                  <List label="Components found">
                    {results.map((node) => (
                      <li key={node.id}>
                        <Glyph kind={node.kind} />
                        <button type="button" className="link-btn quiet grow" onClick={() => chooseResult(node.id)}>
                          {node.name}
                        </button>
                        <span className="tag">{kindLabel(node.kind)}</span>
                      </li>
                    ))}
                  </List>
                ) : (
                  <p className="muted">No component matches.</p>
                )}
              </div>
            ) : null}
          </div>
          <SegmentedControl
            label="Graph view"
            options={VIEW_OPTIONS}
            pressed={new Set([view])}
            onToggle={(next) => onViewChoice({ view: next, large })}
          />
          <div className="chips" role="group" aria-label="Show component types">
            {chips.map((chip) => (
              <Chip
                key={chip.id}
                pressed={!hidden.has(chip.keys[0])}
                color={chip.color}
                onToggle={() => toggleChip(chip.keys)}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="canvas-wrap" ref={canvas} data-far={large && far ? 'true' : undefined}>
          <ReactFlow<FlowNode, RoutedFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              if (node.type === 'component') activate(node.id);
            }}
            colorMode={theme}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            onInit={() => setReady(true)}
            onMoveStart={(event) => {
              if (event) userMoved.current = true;
            }}
            minZoom={MIN_ZOOM}
            maxZoom={1.6}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls
              showInteractive={false}
              showFitView={rendered.view !== 'focus'}
              fitViewOptions={FIT_BUTTON_OPTIONS}
            >
              {rendered.view === 'focus' ? (
                <ControlButton
                  className="react-flow__controls-fitview"
                  title="Fit view"
                  aria-label="Fit view"
                  onClick={() => {
                    userMoved.current = false;
                    fit();
                  }}
                >
                  <FitIcon />
                </ControlButton>
              ) : null}
            </Controls>
          </ReactFlow>
        </div>
        <div className="graph-foot">
          <Legend />
          <span className="muted graph-count" aria-live="polite">
            {shownCount} of {full.nodes.length} components
          </span>
        </div>
      </Card>
      <Inspector snapshot={snapshot} graph={full} node={selected} onSelect={select} onOpenRoute={onOpenRoute} />
    </div>
  );
};

export const GraphPanel = (props: GraphPanelProps) => (
  <ReactFlowProvider>
    <GraphCanvasView {...props} />
  </ReactFlowProvider>
);
