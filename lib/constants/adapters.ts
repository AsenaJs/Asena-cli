import type { ImportsByFiles } from '../types';

/**
 * Hono Adapter imports for root file (index.ts)
 */
export const HONO_ROOT_IMPORTS: ImportsByFiles = {
  '@asenajs/asena': ['AsenaServerFactory'],
  '@asenajs/hono-adapter': ['createHonoAdapter'],
};

/**
 * Hono Adapter imports for controller files
 */
export const HONO_CONTROLLER_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Controller'],
  '@asenajs/asena/web': ['Get'],
  '@asenajs/hono-adapter': ['type Context'],
};

/**
 * Hono Adapter imports for middleware files
 */
export const HONO_MIDDLEWARE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Middleware'],
  '@asenajs/hono-adapter': ['type Context', 'MiddlewareService'],
};

/**
 * Ergenecore Adapter imports for root file (index.ts)
 */
export const ERGENECORE_ROOT_IMPORTS: ImportsByFiles = {
  '@asenajs/asena': ['AsenaServerFactory'],
  '@asenajs/ergenecore': ['createErgenecoreAdapter'],
};

/**
 * Ergenecore Adapter imports for controller files
 */
export const ERGENECORE_CONTROLLER_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Controller'],
  '@asenajs/asena/web': ['Get'],
  '@asenajs/ergenecore': ['type Context'],
};

/**
 * Ergenecore Adapter imports for middleware files
 */
export const ERGENECORE_MIDDLEWARE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Middleware'],
  '@asenajs/ergenecore': ['type Context', 'MiddlewareService'],
};

/**
 * Hono Adapter imports for config files (ServerConfig)
 */
export const HONO_CONFIG_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Config'],
  '@asenajs/hono-adapter': ['ConfigService', 'type Context'],
};

/**
 * Ergenecore Adapter imports for config files (ServerConfig)
 */
export const ERGENECORE_CONFIG_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Config'],
  '@asenajs/ergenecore': ['ConfigService', 'type Context'],
};

/**
 * WebSocket namespace imports (adapter-agnostic)
 */
export const WEBSOCKET_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['WebSocket'],
  '@asenajs/asena/web-socket': ['AsenaWebSocketService', 'type Socket'],
};

/**
 * Adapter package names for installation
 */
export const ADAPTER_PACKAGES: Record<'hono' | 'ergenecore', string> = {
  hono: '@asenajs/hono-adapter',
  ergenecore: '@asenajs/ergenecore',
};