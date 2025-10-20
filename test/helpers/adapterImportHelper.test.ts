import { describe, expect, it } from 'bun:test';
import {
  getRootImports,
  getControllerImports,
  getMiddlewareImports,
  getConfigImports,
  getWebSocketImports,
  getAdapterFunctionName,
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

      expect(imports['@asenajs/asena/server']).toContain('Controller');

      expect(imports['@asenajs/asena/web']).toContain('Get');

      expect(imports['@asenajs/hono-adapter']).toContain('type Context');
    });

    it('should return Ergenecore controller imports for ergenecore adapter', () => {
      const imports = getControllerImports('ergenecore');

      expect(imports['@asenajs/asena/server']).toContain('Controller');

      expect(imports['@asenajs/asena/web']).toContain('Get');

      expect(imports['@asenajs/ergenecore']).toContain('type Context');
    });
  });

  describe('getMiddlewareImports', () => {
    it('should return Hono middleware imports for hono adapter', () => {
      const imports = getMiddlewareImports('hono');

      expect(imports['@asenajs/asena/server']).toContain('Middleware');

      expect(imports['@asenajs/hono-adapter']).toContain('type Context');

      expect(imports['@asenajs/hono-adapter']).toContain('MiddlewareService');
    });

    it('should return Ergenecore middleware imports for ergenecore adapter', () => {
      const imports = getMiddlewareImports('ergenecore');

      expect(imports['@asenajs/asena/server']).toContain('Middleware');

      expect(imports['@asenajs/ergenecore']).toContain('type Context');

      expect(imports['@asenajs/ergenecore']).toContain('MiddlewareService');
    });
  });

  describe('getConfigImports', () => {
    it('should return Hono config imports for hono adapter', () => {
      const imports = getConfigImports('hono');

      expect(imports['@asenajs/asena/server']).toContain('Config');

      expect(imports['@asenajs/hono-adapter']).toContain('ConfigService');

      expect(imports['@asenajs/hono-adapter']).toContain('type Context');
    });

    it('should return Ergenecore config imports for ergenecore adapter', () => {
      const imports = getConfigImports('ergenecore');

      expect(imports['@asenajs/asena/server']).toContain('Config');

      expect(imports['@asenajs/ergenecore']).toContain('ConfigService');

      expect(imports['@asenajs/ergenecore']).toContain('type Context');
    });
  });

  describe('getWebSocketImports', () => {
    it('should return adapter-agnostic WebSocket imports', () => {
      const imports = getWebSocketImports();

      expect(imports['@asenajs/asena/server']).toContain('WebSocket');

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
});
