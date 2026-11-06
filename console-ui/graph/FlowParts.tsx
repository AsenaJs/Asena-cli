import {
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  type Node,
  type NodeProps,
  Position,
} from '@xyflow/react';
import type { CSSProperties } from 'react';
import { Glyph } from '../ui/components';
import { KIND_STYLES } from '../ui/kinds';
import type { GraphEdgeKind, GraphNode } from './buildGraph';
import { type EdgeRoute, roundedPath } from './layout';

export type ComponentFlowNode = Node<{ node: GraphNode; meta: string; dim: boolean }, 'component'>;

export type LaneFlowNode = Node<{ label: string }, 'lane'>;

export type FlowNode = ComponentFlowNode | LaneFlowNode;

export type RoutedFlowEdge = Edge<
  { kind: GraphEdgeKind; label?: string; route?: EdgeRoute; active: boolean; dim: boolean },
  'routed'
>;

export const ComponentNode = ({ data, selected }: NodeProps<ComponentFlowNode>) => (
  <div
    className="node"
    style={{ '--c': KIND_STYLES[data.node.kind].color } as CSSProperties}
    data-selected={selected ? 'true' : undefined}
    data-dim={data.dim ? 'true' : undefined}
    data-matched={data.node.matched ? 'true' : undefined}
  >
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <Glyph kind={data.node.kind} />
    <span className="name" title={data.node.name}>
      {data.node.name}
    </span>
    <span className="meta">{data.meta}</span>
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>
);

export const LaneNode = ({ data }: NodeProps<LaneFlowNode>) => <div className="lane-label">{data.label}</div>;

const ARROW = 7;

/** A filled arrowhead at `tip`, pointing away from `from`. */
const arrowHead = (from: { x: number; y: number }, tip: { x: number; y: number }): string => {
  const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / length;
  const uy = (tip.y - from.y) / length;
  const bx = tip.x - ux * ARROW;
  const by = tip.y - uy * ARROW;

  return `M${tip.x} ${tip.y} L${bx - uy * (ARROW / 2)} ${by + ux * (ARROW / 2)} L${bx + uy * (ARROW / 2)} ${by - ux * (ARROW / 2)} Z`;
};

export const RoutedEdge = ({ id, data, sourceX, sourceY, targetX, targetY }: EdgeProps<RoutedFlowEdge>) => {
  const points = data?.route?.points ?? [];
  let path: string;
  let head: string;
  let labelAt: { x: number; y: number };

  if (points.length >= 2) {
    const tip = points[points.length - 1];
    const before = points[points.length - 2];

    path = roundedPath(points);
    head = arrowHead(before, tip);
    labelAt = data?.route?.label ?? { x: (points[0].x + tip.x) / 2, y: (points[0].y + tip.y) / 2 };
  } else {
    const [bezier, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Right,
      targetX,
      targetY,
      targetPosition: Position.Left,
    });

    path = bezier;
    head = arrowHead({ x: targetX - 10, y: targetY }, { x: targetX, y: targetY });
    labelAt = { x: labelX, y: labelY };
  }

  const state = data?.dim ? 'dim' : data?.active ? 'active' : 'idle';

  return (
    <>
      <g className={`edge edge-${data?.kind ?? 'inject'}`} data-state={state}>
        <path id={id} className="edge-line" d={path} fill="none" />
        <path className="edge-head" d={head} />
      </g>
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            data-state={state}
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};
