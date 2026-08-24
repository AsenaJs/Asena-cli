import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getControllers } from '../../lib/helpers/controllerHelper';
import { copySampleApp, FIXTURE_DIR } from '../utils/fixtureCopy';

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
  const fixtureDir = FIXTURE_DIR;
  const srcDir = 'src'; // relative path for getAllFiles
  const rootFile = path.join('src', 'index.ts'); // relative to fixtureDir

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
      expect(service.exportName).toBe('TestService');
      expect(service.Class.name).toBe('TestService');
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
      expect(controller.exportName).toBe('TestController');
      expect(controller.Class.name).toBe('TestController');
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
      const detectedClasses = allComponents.filter((c) => c && c.Class && c.Class.name);

      // Should find exactly 2 components (TestService + TestController)
      expect(detectedClasses.length).toBe(2);

      const names = detectedClasses.map((c) => c.Class.name);
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

  describe('scan behaviour on a copied project', () => {
    const originalCwd = process.cwd();
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-scan-'));
      copySampleApp(tmpDir);
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return the export key with each detected class', async () => {
      const components = await getControllers(rootFile, srcDir);

      expect(components['services/TestService.ts'][0].exportName).toBe('TestService');
      expect(components['controllers/TestController.ts'][0].exportName).toBe('TestController');
    });

    it('should dedupe a class re-exported through a barrel file', async () => {
      fs.writeFileSync(
        path.join('src', 'controllers', 'index.ts'),
        "export { TestService } from '../services/TestService.ts';\nexport { TestController } from './TestController.ts';\n",
      );

      const components = await getControllers(rootFile, srcDir);

      const allComponents = Object.values(components).flat();
      const uniqueClasses = new Set(allComponents.map((c) => c.Class));

      expect(uniqueClasses.size).toBe(2);
      expect(allComponents.filter((c) => c.Class.name === 'TestService')).toHaveLength(1);
      expect(allComponents.filter((c) => c.Class.name === 'TestController')).toHaveLength(1);
    });

    it('should skip leftover *.asena.js files from older CLI versions', async () => {
      fs.writeFileSync(
        path.join('src', 'legacy.asena.js'),
        "export { TestService } from './services/TestService.ts';\n",
      );

      const components = await getControllers(rootFile, srcDir);

      expect(components['legacy.asena.js']).toBeUndefined();

      const allComponents = Object.values(components).flat();
      expect(allComponents.filter((c) => c.Class.name === 'TestService')).toHaveLength(1);
    });

    it('should rethrow import failures with the file name', async () => {
      fs.writeFileSync(path.join('src', 'broken.ts'), "throw new Error('kaboom in component file');\n");

      await expect(getControllers(rootFile, srcDir)).rejects.toThrow(/broken\.ts.*kaboom/);
    });
  });
});
