import { describe, expect, it } from 'bun:test';
import { join } from 'path';
import { getControllers } from '../../lib/helpers/controllerHelper';

/**
 * Component Detection Integration Test
 *
 * Tests that CLI can detect real Asena components (@Service, @Controller, @Middleware)
 * using a real test fixture project with installed dependencies.
 *
 * This test ensures the Symbol-based detection works correctly by:
 * 1. Loading ComponentConstants from the fixture's node_modules/@asenajs/asena
 * 2. Scanning TypeScript files with real @Service and @Controller decorators
 * 3. Verifying components are detected correctly
 */
describe('Component Detection Integration', () => {
  const fixtureDir = join(process.cwd(), 'test/fixtures/sample-app');
  const srcDir = 'src'; // relative path for getAllFiles
  const rootFile = join('src', 'index.ts'); // relative to fixtureDir

  it('should detect @Service decorated component', async () => {
    const originalCwd = process.cwd();

    try {
      // Change to fixture directory so loadComponentConstants finds the right node_modules
      process.chdir(fixtureDir);

      const components = await getControllers(rootFile, srcDir);

      // Should detect TestService
      expect(components['services/TestService.ts']).toBeDefined();
      expect(components['services/TestService.ts'].length).toBe(1);

      const service = components['services/TestService.ts'][0];
      expect(service.name).toBe('TestService');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should detect @Controller decorated component', async () => {
    const originalCwd = process.cwd();

    try {
      process.chdir(fixtureDir);

      const components = await getControllers(rootFile, srcDir);

      // Should detect TestController
      expect(components['controllers/TestController.ts']).toBeDefined();
      expect(components['controllers/TestController.ts'].length).toBe(1);

      const controller = components['controllers/TestController.ts'][0];
      expect(controller.name).toBe('TestController');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should skip root file (index.ts)', async () => {
    const originalCwd = process.cwd();

    try {
      process.chdir(fixtureDir);

      const components = await getControllers(rootFile, srcDir);

      // index.ts should NOT be in the components list
      expect(components['index.ts']).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should detect all components in one scan', async () => {
    const originalCwd = process.cwd();

    try {
      process.chdir(fixtureDir);

      const components = await getControllers(rootFile, srcDir);

      // Count total detected components
      const allComponents = Object.values(components).flat();
      const detectedClasses = allComponents.filter((c: any) => c && c.name);

      // Should find exactly 2 components (TestService + TestController)
      expect(detectedClasses.length).toBe(2);

      const names = detectedClasses.map((c: any) => c.name);
      expect(names).toContain('TestService');
      expect(names).toContain('TestController');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should use ComponentConstants from fixture node_modules', async () => {
    const originalCwd = process.cwd();

    try {
      process.chdir(fixtureDir);

      // Load ComponentConstants from the fixture's @asenajs/asena
      const { loadComponentConstants } = await import('../../lib/constants/ioc');
      const ComponentConstants = await loadComponentConstants();

      // Verify Symbol properties exist
      expect(ComponentConstants.IOCObjectKey).toBeDefined();
      expect(typeof ComponentConstants.IOCObjectKey).toBe('symbol');
      expect(ComponentConstants.IOCObjectKey.description).toBe('component:iocObject');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
