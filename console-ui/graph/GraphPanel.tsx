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
  type Viewport,
} from '@xyflow/react';
import { type FocusEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DevtoolsSnapshot } from '../../lib/console/protocol';
import type { ThemeChoice } from '../shell/theme';
import { Card, Chip, Glyph, List, SearchField, SegmentedControl } from '../ui/components';
import { Icon } from '../ui/icons';
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
  type EdgeEmphasis,
  edgeState,
  type FitMode,
  firstSelection,
  fitModeFor,
  focusGraph,
  graphCountLabel,
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
import { type GraphLayout, gridLayout, laneGridLayout, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from './layout';

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

/** Whether the view is where the last fit put it. The zoom buttons move it with no input event to tell by. */
export const isAtFit = (current: Viewport, fitted: Viewport | null): boolean =>
  fitted !== null &&
  Math.abs(current.x - fitted.x) < 0.5 &&
  Math.abs(current.y - fitted.y) < 0.5 &&
  Math.abs(current.zoom - fitted.zoom) < 0.001;

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
  emphasis: EdgeEmphasis,
): RoutedFlowEdge[] =>
  graph.edges.map((edge) => {
    const route = layout.edges.get(edge.id);
    const state = edgeState(edge, visible, emphasis);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'routed',
      focusable: false,
      selectable: false,
      // Packed in a grid, an edge above the nodes would run through the names it crosses.
      zIndex: state === 'active' && !emphasis.quiet ? 1 : 0,
      data: {
        kind: edge.kind,
        ...(edge.label === undefined ? {} : { label: edge.label }),
        ...(route ? { route } : {}),
        state,
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const quiet = rendered.fit === 'width';
  const edges = useMemo(() => {
    const lit = new Set([selectedId, quiet ? hoveredId : null].filter((id) => id !== null));

    return toFlowEdges(rendered.graph, rendered.layout, visible, { lit, quiet });
  }, [rendered, visible, selectedId, hoveredId, quiet]);
  const { getViewport, setViewport } = useReactFlow<FlowNode>();
  const far = useStore((store) => store.transform[2] < FAR_ZOOM);
  const [ready, setReady] = useState(false);
  const pendingFit = useRef(true);
  const fitted = useRef<Viewport | null>(null);
  const onCanvas = useRef(rendered);
  const canvas = useRef<HTMLDivElement>(null);
  const chips = useMemo(() => kindChips(full, large), [full, large]);
  const results = view === 'focus' ? searchResults(full, search) : [];
  const countLabel = graphCountLabel(
    full,
    rendered.graph.nodes.filter((node) => visible.has(node.id)),
  );

  onCanvas.current = rendered;

  // A canvas not laid out yet (0 x 0) keeps the fit pending until the resize observer reports a size.
  const fit = useCallback(() => {
    const element = canvas.current;

    if (!element || element.clientWidth === 0 || element.clientHeight === 0) return;

    pendingFit.current = false;
    fitted.current = viewportFor(
      onCanvas.current.fit,
      layoutBounds(onCanvas.current.layout),
      element.clientWidth,
      element.clientHeight,
    );
    void setViewport(fitted.current);
  }, [setViewport]);

  useEffect(() => {
    let cancelled = false;
    const show = (layout: GraphLayout) => {
      pendingFit.current = true;
      setRendered({ graph: shown, layout, view, fit: fitMode });
    };

    (fitMode === 'width' ? Promise.resolve(laneGridLayout(shown)) : layoutGraph(shown))
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
      if (pendingFit.current || isAtFit(getViewport(), fitted.current)) fit();
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [ready, fit, getViewport]);

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
        <div
          className="canvas-wrap"
          ref={canvas}
          data-large={large ? 'true' : undefined}
          data-far={large && far ? 'true' : undefined}
        >
          <ReactFlow<FlowNode, RoutedFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              if (node.type === 'component') activate(node.id);
            }}
            onNodeMouseEnter={(_, node) => {
              if (node.type === 'component') setHoveredId(node.id);
            }}
            onNodeMouseLeave={() => setHoveredId(null)}
            onPaneClick={() => {
              if (quiet) setPickedId(null);
            }}
            colorMode={theme}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            onInit={() => setReady(true)}
            minZoom={MIN_ZOOM}
            maxZoom={1.6}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls showInteractive={false} showFitView={false}>
              <ControlButton
                className="react-flow__controls-fitview"
                title="Fit view"
                aria-label="Fit view"
                onClick={fit}
              >
                <Icon name="fit" />
              </ControlButton>
            </Controls>
          </ReactFlow>
        </div>
        <div className="graph-foot">
          <Legend />
          <span className="muted graph-count" aria-live="polite">
            {countLabel}
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
