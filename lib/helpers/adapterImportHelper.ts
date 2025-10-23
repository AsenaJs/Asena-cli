import type { ImportsByFiles } from '../types';
import type { AdapterType } from '../types/adapterConfig';
import {
  HONO_ROOT_IMPORTS,
  HONO_CONTROLLER_IMPORTS,
  HONO_MIDDLEWARE_IMPORTS,
  HONO_CONFIG_IMPORTS,
  ERGENECORE_ROOT_IMPORTS,
  ERGENECORE_CONTROLLER_IMPORTS,
  ERGENECORE_MIDDLEWARE_IMPORTS,
  ERGENECORE_CONFIG_IMPORTS,
  WEBSOCKET_IMPORTS,
  ADAPTER_PACKAGES,
} from '../constants/adapters';

/**
 * Get root file imports for the specified adapter
 * @param adapter AdapterType ('hono' or 'ergenecore')
 * @returns ImportsByFiles for root file (index.ts)
 */
export function getRootImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_ROOT_IMPORTS : ERGENECORE_ROOT_IMPORTS;
}

/**
 * Get controller imports for the specified adapter
 * @param adapter AdapterType ('hono' or 'ergenecore')
 * @returns ImportsByFiles for controller files
 */
export function getControllerImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_CONTROLLER_IMPORTS : ERGENECORE_CONTROLLER_IMPORTS;
}

/**
 * Get middleware imports for the specified adapter
 * @param adapter AdapterType ('hono' or 'ergenecore')
 * @returns ImportsByFiles for middleware files
 */
export function getMiddlewareImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_MIDDLEWARE_IMPORTS : ERGENECORE_MIDDLEWARE_IMPORTS;
}

/**
 * Get adapter factory function name
 * @param adapter AdapterType ('hono' or 'ergenecore')
 * @returns Factory function name
 */
export function getAdapterFunctionName(adapter: AdapterType): string {
  return adapter === 'hono' ? 'createHonoAdapter' : 'createErgenecoreAdapter';
}

/**
 * Get config imports for the specified adapter
 * @param adapter AdapterType ('hono' or 'ergenecore')
 * @returns ImportsByFiles for config files (ServerConfig)
 */
export function getConfigImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_CONFIG_IMPORTS : ERGENECORE_CONFIG_IMPORTS;
}

/**
 * Get WebSocket namespace imports (adapter-agnostic)
 * @returns ImportsByFiles for WebSocket namespace files
 */
export function getWebSocketImports(): ImportsByFiles {
  return WEBSOCKET_IMPORTS;
}

/**
 * Get adapter package name for installation
 * @param adapter AdapterType ('hono' or 'ergenecore')
 * @returns npm package name
 */
export function getAdapterPackage(adapter: AdapterType): string {
  return ADAPTER_PACKAGES[adapter];
}
