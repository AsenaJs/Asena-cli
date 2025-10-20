import { describe, expect, it } from 'bun:test';
import { loadComponentConstants } from '../../lib/constants/ioc';

/**
 * Tests for loading ComponentConstants from user's @asenajs/asena installation
 * This ensures Symbol consistency between CLI and framework
 */
describe('loadComponentConstants', () => {
  it('should load ComponentConstants from current project', async () => {
    // Load from current project's node_modules
    const ComponentConstants = await loadComponentConstants();

    // Verify it's an object with expected Symbol properties
    expect(ComponentConstants).toBeDefined();
    expect(ComponentConstants.IOCObjectKey).toBeDefined();
    expect(typeof ComponentConstants.IOCObjectKey).toBe('symbol');
  });

  it('should have all required Symbol keys', async () => {
    const ComponentConstants = await loadComponentConstants();

    // Check essential keys that CLI uses for component detection
    expect(ComponentConstants.IOCObjectKey).toBeDefined();
    expect(ComponentConstants.NameKey).toBeDefined();
    expect(ComponentConstants.TypeKey).toBeDefined();
    expect(ComponentConstants.ScopeKey).toBeDefined();

    // All should be Symbols
    expect(typeof ComponentConstants.IOCObjectKey).toBe('symbol');
    expect(typeof ComponentConstants.NameKey).toBe('symbol');
    expect(typeof ComponentConstants.TypeKey).toBe('symbol');
    expect(typeof ComponentConstants.ScopeKey).toBe('symbol');
  });

  it('should load the same Symbol instance on multiple calls', async () => {
    // Load twice
    const constants1 = await loadComponentConstants();
    const constants2 = await loadComponentConstants();

    // Symbol instances should be the same (same reference)
    expect(constants1.IOCObjectKey).toBe(constants2.IOCObjectKey);
    expect(constants1.NameKey).toBe(constants2.NameKey);
  });

  it('should throw error if @asenajs/asena is not installed', async () => {
    // Try to load from a non-existent project
    const nonExistentPath = '/tmp/non-existent-project-xyz-123';

    await expect(loadComponentConstants(nonExistentPath)).rejects.toThrow();
  });
});
