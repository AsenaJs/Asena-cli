import { describe, expect, it } from 'bun:test';
import {
  getRootImports,
  getControllerImports,
  getMiddlewareImports,
  getConfigImports,
  getWebSocketImports,
  getAdapterFunctionName,
  getAdapterInstallPackages,
  getAdapterPackage,
} from '../../lib/helpers/adapterImportHelper';

describe('adapterImportHelper', () => {
  describe('getRootImports', () => {
    it('should return Hono imports for hono adapter', () => {
      const imports = getRootImports('hono');

      expect(imports['@asenajs/asena']).toContain('AsenaServerFactory');

      expect(imports['@asenajs/hono-adapter']).toContain('createHonoAdapter');
    });

    it('should return Ergenecore imports for ergenecore adapter', () => {
      const imports = getRootImports('ergenecore');

      expect(imports['@asenajs/asena']).toContain('AsenaServerFactory');

      expect(imports['@asenajs/ergenecore']).toContain('createErgenecoreAdapter');
    });
  });

  describe('getControllerImports', () => {
    it('should return Hono controller imports for hono adapter', () => {
      const imports = getControllerImports('hono');

      expect(imports['@asenajs/asena/decorators']).toContain('Controller');

      expect(imports['@asenajs/asena/decorators/http']).toContain('Get');

      expect(imports['@asenajs/hono-adapter']).toContain('type Context');
    });

    it('should return Ergenecore controller imports for ergenecore adapter', () => {
      const imports = getControllerImports('ergenecore');

      expect(imports['@asenajs/asena/decorators']).toContain('Controller');

      expect(imports['@asenajs/asena/decorators/http']).toContain('Get');

      expect(imports['@asenajs/ergenecore']).toContain('type Context');
    });
  });

  describe('getMiddlewareImports', () => {
    it('should return Hono middleware imports for hono adapter', () => {
      const imports = getMiddlewareImports('hono');

      expect(imports['@asenajs/asena/decorators']).toContain('Middleware');

      expect(imports['@asenajs/hono-adapter']).toContain('type Context');

      expect(imports['@asenajs/hono-adapter']).toContain('MiddlewareService');
    });

    it('should return Ergenecore middleware imports for ergenecore adapter', () => {
      const imports = getMiddlewareImports('ergenecore');

      expect(imports['@asenajs/asena/decorators']).toContain('Middleware');

      expect(imports['@asenajs/ergenecore']).toContain('type Context');

      expect(imports['@asenajs/ergenecore']).toContain('MiddlewareService');
    });
  });

  describe('getConfigImports', () => {
    it('should return Hono config imports for hono adapter', () => {
      const imports = getConfigImports('hono');

      expect(imports['@asenajs/asena/decorators']).toContain('Config');

      expect(imports['@asenajs/hono-adapter']).toContain('ConfigService');

      expect(imports['@asenajs/hono-adapter']).toContain('type Context');
    });

    it('should return Ergenecore config imports for ergenecore adapter', () => {
      const imports = getConfigImports('ergenecore');

      expect(imports['@asenajs/asena/decorators']).toContain('Config');

      expect(imports['@asenajs/ergenecore']).toContain('ConfigService');

      expect(imports['@asenajs/ergenecore']).toContain('type Context');
    });
  });

  describe('getWebSocketImports', () => {
    it('should return adapter-agnostic WebSocket imports', () => {
      const imports = getWebSocketImports();

      expect(imports['@asenajs/asena/decorators']).toContain('WebSocket');

      expect(imports['@asenajs/asena/web-socket']).toContain('AsenaWebSocketService');

      expect(imports['@asenajs/asena/web-socket']).toContain('type Socket');
    });

    it('should return same imports regardless of adapter', () => {
      const imports1 = getWebSocketImports();
      const imports2 = getWebSocketImports();

      expect(imports1).toEqual(imports2);
    });
  });

  describe('getAdapterFunctionName', () => {
    it('should return createHonoAdapter for hono', () => {
      const funcName = getAdapterFunctionName('hono');

      expect(funcName).toBe('createHonoAdapter');
    });

    it('should return createErgenecoreAdapter for ergenecore', () => {
      const funcName = getAdapterFunctionName('ergenecore');

      expect(funcName).toBe('createErgenecoreAdapter');
    });
  });

  describe('getAdapterPackage', () => {
    it('should return @asenajs/hono-adapter for hono', () => {
      const pkg = getAdapterPackage('hono');

      expect(pkg).toBe('@asenajs/hono-adapter');
    });

    it('should return @asenajs/ergenecore for ergenecore', () => {
      const pkg = getAdapterPackage('ergenecore');

      expect(pkg).toBe('@asenajs/ergenecore');
    });
  });

  // The adapters declare hono and zod as peers - they define the contract, they do not ship the
  // library - so a scaffolded project has to install them itself. The exact key sets are asserted
  // rather than just membership: giving both adapters the same peer list is the easy mistake, and
  // ergenecore has no business installing hono.
  describe('getAdapterInstallPackages', () => {
    it('should install the hono adapter with hono and zod', () => {
      expect(Object.keys(getAdapterInstallPackages('hono')).sort()).toEqual(['@asenajs/hono-adapter', 'hono', 'zod']);
    });

    it('should install the ergenecore adapter with zod but not hono', () => {
      expect(Object.keys(getAdapterInstallPackages('ergenecore')).sort()).toEqual(['@asenajs/ergenecore', 'zod']);
    });

    // `latest` would resolve zod 5 the day it ships, which the adapters' `^4.3.6` peer range
    // cannot satisfy - and an unsatisfiable peer range is what makes a resolver nest a second copy.
    it('should pin zod to v4 rather than latest', () => {
      expect(getAdapterInstallPackages('hono')['zod']).toBe('^4');
      expect(getAdapterInstallPackages('ergenecore')['zod']).toBe('^4');
    });
  });
});
