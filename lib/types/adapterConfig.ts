/**
 * Supported adapter types for Asena projects
 */
export type AdapterType = 'hono' | 'ergenecore';

/**
 * Component types that can have suffixes
 */
export type ComponentType = 'controller' | 'service' | 'middleware' | 'config' | 'websocket';

/**
 * Suffix configuration for a component
 * - true: Use default suffix (e.g., "Controller", "Service")
 * - false: No suffix
 * - string: Custom suffix (e.g., "Svc", "Ctrl")
 */
export type SuffixConfig = boolean | string;

/**
 * Suffix settings for all component types
 */
export interface SuffixSettings {
  controller?: SuffixConfig;
  service?: SuffixConfig;
  middleware?: SuffixConfig;
  config?: SuffixConfig;
  websocket?: SuffixConfig;
}

/**
 * CLI configuration stored in .asena/config.json
 */
export interface AdapterConfig {
  adapter: AdapterType;
  /**
   * Suffix configuration
   * - true: Use default suffixes for all components
   * - false: No suffixes for any components
   * - object: Granular control per component type
   */
  suffixes?: boolean | SuffixSettings;
}
