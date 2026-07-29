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
  '@asenajs/asena/decorators': ['Controller'],
  '@asenajs/asena/decorators/http': ['Get'],
  '@asenajs/hono-adapter': ['type Context'],
};

/**
 * Hono Adapter imports for middleware files
 */
export const HONO_MIDDLEWARE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['Middleware'],
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
  '@asenajs/asena/decorators': ['Controller'],
  '@asenajs/asena/decorators/http': ['Get'],
  '@asenajs/ergenecore': ['type Context'],
};

/**
 * Ergenecore Adapter imports for middleware files
 */
export const ERGENECORE_MIDDLEWARE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['Middleware'],
  '@asenajs/ergenecore': ['type Context', 'MiddlewareService'],
};

/**
 * Hono Adapter imports for config files (ServerConfig)
 */
export const HONO_CONFIG_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['Config'],
  '@asenajs/hono-adapter': ['ConfigService', 'type Context'],
};

/**
 * Ergenecore Adapter imports for config files (ServerConfig)
 */
export const ERGENECORE_CONFIG_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['Config'],
  '@asenajs/ergenecore': ['ConfigService', 'type Context'],
};

/**
 * Hono Adapter imports for validator files
 */
export const HONO_VALIDATOR_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['Middleware'],
  '@asenajs/hono-adapter': ['ValidationService'],
  zod: ['z'],
};

/**
 * Ergenecore Adapter imports for validator files
 */
export const ERGENECORE_VALIDATOR_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['Middleware'],
  '@asenajs/ergenecore': ['ValidationService'],
  zod: ['z'],
};

/**
 * WebSocket namespace imports (adapter-agnostic)
 */
export const WEBSOCKET_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/decorators': ['WebSocket'],
  '@asenajs/asena/web-socket': ['AsenaWebSocketService', 'type Socket'],
};

/**
 * Adapter package names for installation
 */
export const ADAPTER_PACKAGES: Record<'hono' | 'ergenecore', string> = {
  hono: '@asenajs/hono-adapter',
  ergenecore: '@asenajs/ergenecore',
};

/**
 * Peer dependencies each adapter declares but does not provide.
 *
 * Both adapters peer-depend on the libraries whose types cross their public API: hono's `Context`
 * and `HTTPException`, and zod's `ZodType`, are in the published `.d.ts`, so a project's `tsc`
 * needs them installed even when its own code never imports either. `zod` is also what
 * `asena generate validator` emits (`import { z } from 'zod'`) - before the adapters made it a
 * peer that import resolved only by hoisting out of their `dependencies`, which is to say by
 * accident.
 *
 * `zod` is pinned to `^4` rather than `latest`: the adapters' peer range is `^4.3.6`, so the day
 * zod 5 ships, `latest` would resolve a version their peer range cannot satisfy - and an
 * unsatisfiable peer range is exactly what makes a resolver nest a second copy. `hono` can take
 * `latest` because its peer range is deliberately uncapped.
 */
export const ADAPTER_PEER_PACKAGES: Record<'hono' | 'ergenecore', Record<string, string>> = {
  hono: { hono: 'latest', zod: '^4' },
  ergenecore: { zod: '^4' },
};

/**
 * Everything `asena create` installs for an adapter: the adapter itself plus its peers.
 *
 * Declared here rather than inline because two call sites install it - the `--skip-install`
 * literal and the `bun add` invocation - and a package present in one but not the other is a
 * scaffold that works only under one flag.
 */
export const ADAPTER_INSTALL_PACKAGES: Record<'hono' | 'ergenecore', Record<string, string>> = {
  hono: { [ADAPTER_PACKAGES.hono]: 'latest', ...ADAPTER_PEER_PACKAGES.hono },
  ergenecore: { [ADAPTER_PACKAGES.ergenecore]: 'latest', ...ADAPTER_PEER_PACKAGES.ergenecore },
};
