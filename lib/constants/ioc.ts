/**
 * Component metadata constants
 * We load ComponentConstants from the user's installed @asenajs/asena package at runtime
 * to ensure Symbol consistency between the framework and CLI during component detection
 */

// Legacy constant for backward compatibility (deprecated)
/** @deprecated Use ComponentConstants.IOCObjectKey instead */
export const IOC_OBJECT_KEY = '_IIocObject';

/**
 * Loads ComponentConstants from the user's node_modules/@asenajs/asena
 * This ensures we use the exact same Symbol instances as the framework decorators
 *
 * @param projectRoot - The root directory of the user's project
 * @returns ComponentConstants from @asenajs/asena
 */
export async function loadComponentConstants(projectRoot: string = process.cwd()) {
  try {
    // Load from user's project node_modules
    const asenaConstantsPath = `${projectRoot}/node_modules/@asenajs/asena/dist/lib/ioc/constants/ComponentConstants.js`;
    const module = await import(asenaConstantsPath);

    return module.ComponentConstants;
  } catch (error) {
    throw new Error(
      `Failed to load ComponentConstants from @asenajs/asena in project: ${projectRoot}\n` +
        'Make sure @asenajs/asena is installed as a dependency in your project.\n' +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
