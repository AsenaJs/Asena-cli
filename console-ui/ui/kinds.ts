import type { DevtoolsComponentType } from '../../lib/console/protocol';

/** A component type, or `CORE` for a dependency target that no component of the app provides. */
export type ComponentKind = DevtoolsComponentType | 'CORE';

export interface KindStyle {
  label: string;
  /** The short text in the soft-tinted glyph chip. */
  glyph: string;
  /** A `--t-*` token. */
  color: string;
}

export const KIND_STYLES: Record<ComponentKind, KindStyle> = {
  CONTROLLER: { label: 'Controller', glyph: 'C', color: 'var(--t-controller)' },
  FRONTEND_CONTROLLER: { label: 'Frontend controller', glyph: 'F', color: 'var(--t-controller)' },
  SERVICE: { label: 'Service', glyph: 'S', color: 'var(--t-service)' },
  COMPONENT: { label: 'Component', glyph: 'K', color: 'var(--t-service)' },
  MIDDLEWARE: { label: 'Middleware', glyph: 'M', color: 'var(--t-middleware)' },
  WEBSOCKET: { label: 'WebSocket', glyph: 'WS', color: 'var(--t-ws)' },
  MESSAGE_CONTROLLER: { label: 'Message controller', glyph: 'MQ', color: 'var(--t-ws)' },
  EVENT: { label: 'Event', glyph: 'E', color: 'var(--t-event)' },
  SCHEDULE: { label: 'Schedule', glyph: '⏱', color: 'var(--t-schedule)' },
  EXCEPTION_HANDLER: { label: 'Exception handler', glyph: '!', color: 'var(--t-exception)' },
  CONFIG: { label: 'Config', glyph: 'cfg', color: 'var(--t-config)' },
  POST_PROCESSOR: { label: 'Post-processor', glyph: 'PP', color: 'var(--t-config)' },
  CORE: { label: 'Core service', glyph: 'fw', color: 'var(--t-config)' },
};

export const kindLabel = (kind: ComponentKind): string => KIND_STYLES[kind].label;
