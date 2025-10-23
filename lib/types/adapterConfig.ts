/**
 * Supported adapter types for Asena projects
 */
export type AdapterType = 'hono' | 'ergenecore';

/**
 * CLI configuration stored in .asena/config.json
 */
export interface AdapterConfig {
  adapter: AdapterType;
}
