/**
 * Build configuration options for Asena projects.
 *
 * This type is a subset of Bun's BuildConfig, exposing only the options
 * relevant for backend framework builds. All fields are optional.
 *
 * @remarks
 * - The entrypoints and target are managed internally by Asena CLI
 * - Asena always builds for 'bun' target since it's a Bun-native backend framework
 *
 * @example
 * ```typescript
 * const buildOptions: BuildOptions = {
 *   outdir: './dist',
 *   minify: true,
 *   sourcemap: 'external',
 *   external: ['better-sqlite3'],
 *   drop: ['console']
 * };
 * ```
 *
 * @see {@link https://bun.sh/docs/bundler Bun Bundler Documentation}
 */
export type BuildOptions = Partial<
  Pick<
    Bun.BuildConfig,
    'outdir' | 'sourcemap' | 'minify' | 'external' | 'format' | 'drop'
  >
>;

/**
 * Main configuration interface for Asena framework projects.
 *
 * This configuration is typically defined in an `asena-config.ts` file at the
 * project root and is used by the CLI to understand the project structure
 * and build settings.
 *
 * @example
 * ```typescript
 * // asena-config.ts
 * import type { AsenaConfig } from '@asenajs/cli';
 *
 * const config: AsenaConfig = {
 *   sourceFolder: './src',
 *   rootFile: './src/index.ts',
 *   buildOptions: {
 *     outdir: './dist',
 *     target: 'bun',
 *     minify: true
 *   }
 * };
 *
 * export default config;
 * ```
 */
export interface AsenaConfig {
  /**
   * Path to the source folder containing controllers, services, and other components.
   *
   * This folder will be scanned for Asena decorators and components during the build process.
   *
   * @example './src' or './app'
   */
  sourceFolder: string;

  /**
   * Path to the root entry file of the application.
   *
   * This file should contain the AsenaServer initialization and is used as the
   * main entry point for the build process. The build system will use this file
   * to create the entrypoints configuration.
   *
      * @remarks
   * This path will always override the entrypoints in buildOptions if specified.
   *
   * @example './src/index.ts' or './src/main.ts'
   */
  rootFile: string;

  /**
   * Optional build configuration options.
   *
   * If not specified, default build options will be used:
   * - outdir: './out'
   * - target: 'bun' (always, managed internally)
   * - format: 'esm' (default from Bun)
   *
   * @remarks
   * - The entrypoints and target are managed internally by Asena CLI
   * - Only backend-relevant build options are exposed (outdir, minify, sourcemap, external, format, drop)
   * - A footer with Asena Framework signature is automatically added to all builds
   *
   * @see {@link BuildOptions}
   */
  buildOptions?: BuildOptions;
}
