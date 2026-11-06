import type { DevtoolsSnapshot } from '../../lib/console/protocol';
import { kindLabel } from '../ui/kinds';
import { type GraphNode, routesOf } from './buildGraph';

export const LANES = ['Entry points', 'Services & middleware', 'Data & errors'] as const;

export type Lane = 0 | 1 | 2;

// Repositories are @Service components; their names are the only thing that sets them apart.
const DATA_NAME = /(Repository|Repo|Store|Database|Dao)$/;

export const laneOf = (node: GraphNode): Lane => {
  switch (node.kind) {
    case 'CONTROLLER':
    case 'FRONTEND_CONTROLLER':
    case 'WEBSOCKET':
    case 'MESSAGE_CONTROLLER':
    case 'EVENT':
    case 'SCHEDULE':
    case 'CONFIG':
      return 0;
    case 'EXCEPTION_HANDLER':
    case 'CORE':
      return 2;
    default:
      return DATA_NAME.test(node.name) || DATA_NAME.test(node.component?.className ?? '') ? 2 : 1;
  }
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : word.endsWith('ch') ? 'es' : 's'}`;

/** The second line of a node: its type and the one fact that tells it apart. */
export const nodeMeta = (snapshot: DevtoolsSnapshot, node: GraphNode): string => {
  const { component } = node;
  const label = kindLabel(node.kind);

  if (node.group) return `${label} · click to expand`;
  if (!component) return `${label} · from the framework`;

  const fact = (() => {
    switch (component.type) {
      case 'CONTROLLER':
        return plural(routesOf(snapshot, component.name).serves.length, 'route');
      case 'FRONTEND_CONTROLLER':
        return plural((snapshot.pages ?? []).filter((page) => page.controller === component.name).length, 'page');
      case 'WEBSOCKET': {
        const socket = snapshot.websockets.find((candidate) => candidate.component === component.name);

        return socket ? `/${socket.namespace}` : null;
      }
      case 'EVENT': {
        const events = snapshot.events.filter((handler) => handler.component === component.name);

        return events[0] ? `${events[0].event}${events.length > 1 ? ` +${events.length - 1}` : ''}` : null;
      }
      case 'SCHEDULE':
        return snapshot.schedules.find((schedule) => schedule.name === component.name)?.cron ?? null;
      case 'MESSAGE_CONTROLLER':
        return plural(
          snapshot.messageHandlers.filter((handler) => handler.controller === component.name).length,
          'handler',
        );
      case 'EXCEPTION_HANDLER': {
        const handler = snapshot.exceptionHandlers.find((candidate) => candidate.component === component.name);

        return handler ? `${plural(handler.catches.length, 'catch')}${handler.notFound ? ' + 404' : ''}` : null;
      }
      case 'CONFIG':
        return `${snapshot.config.globalMiddlewares.length} global middleware`;
      case 'MIDDLEWARE': {
        if (snapshot.config.globalMiddlewares.some((entry) => entry.middleware === component.name)) {
          return 'every request';
        }

        const guards = routesOf(snapshot, component.name).guards;

        if (guards.some((route) => route.validator === component.name)) return 'validator';

        return guards.length > 0 ? 'route-level' : null;
      }
      default:
        if (component.values.length > 0) return plural(component.values.length, 'env value');
        if (component.dependencies.length > 0) return `injects ${component.dependencies.length}`;

        return null;
    }
  })();

  return fact ? `${label} · ${fact}` : label;
};
