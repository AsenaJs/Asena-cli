import { $ } from 'bun';
import type { AdapterConfig, AdapterType, ComponentType } from '../types';

const CONFIG_DIR = '.asena';
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;

/**
 * Default suffixes for each component type
 */
const DEFAULT_SUFFIXES: Record<ComponentType, string> = {
  controller: 'Controller',
  service: 'Service',
  middleware: 'Middleware',
  config: 'Config',
  websocket: 'Namespace',
};

/**
 * Read adapter configuration from .asena/config.json
 * @returns AdapterConfig object with default 'hono' if file doesn't exist
 */
export async function readAdapterConfig(): Promise<AdapterConfig> {
  const exists = await isAdapterConfigExists();

  if (!exists) {
    return { adapter: 'hono' }; // Default to Hono adapter
  }

  try {
    const configFile = Bun.file(CONFIG_FILE);
    const config = await configFile.json();

    // Validate adapter type
    if (config.adapter && (config.adapter === 'hono' || config.adapter === 'ergenecore')) {
      return config as AdapterConfig;
    }

    // If invalid adapter, default to hono
    console.warn(`Invalid adapter type '${config.adapter}' in config, defaulting to 'hono'`);

    return { adapter: 'hono' };
  } catch {
    console.warn('Failed to parse .asena/config.json, defaulting to hono adapter');

    return { adapter: 'hono' };
  }
}

/**
 * Write adapter configuration to .asena/config.json
 * Creates .asena directory if it doesn't exist
 * @param config AdapterConfig to write
 */
export async function writeAdapterConfig(config: AdapterConfig): Promise<void> {
  // Create .asena directory if it doesn't exist (mkdir -p)
  await $`mkdir -p ${CONFIG_DIR}`.quiet();

  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get adapter type from config
 * @returns AdapterType ('hono' or 'ergenecore')
 */
export async function getAdapterConfig(): Promise<AdapterType> {
  const config = await readAdapterConfig();

  return config.adapter;
}

/**
 * Check if .asena/config.json exists
 * @returns true if config file exists, false otherwise
 */
export async function isAdapterConfigExists(): Promise<boolean> {
  return await Bun.file(CONFIG_FILE).exists();
}

/**
 * Resolve suffix for a component based on configuration
 * @param componentType The type of component (controller, service, etc.)
 * @returns The resolved suffix string (empty string if no suffix should be used)
 *
 * @example
 * // Config: { suffixes: true }
 * await resolveSuffix('controller') // Returns "Controller"
 *
 * @example
 * // Config: { suffixes: false }
 * await resolveSuffix('controller') // Returns ""
 *
 * @example
 * // Config: { suffixes: { controller: "Ctrl" } }
 * await resolveSuffix('controller') // Returns "Ctrl"
 *
 * @example
 * // Config: { suffixes: { controller: false } }
 * await resolveSuffix('controller') // Returns ""
 */
export async function resolveSuffix(componentType: ComponentType): Promise<string> {
  const config = await readAdapterConfig();
  const { suffixes } = config;

  // If suffixes is not defined, use default suffix for backward compatibility
  if (suffixes === undefined) {
    return DEFAULT_SUFFIXES[componentType];
  }

  // If suffixes is a boolean
  if (typeof suffixes === 'boolean') {
    return suffixes ? DEFAULT_SUFFIXES[componentType] : '';
  }

  // If suffixes is an object (granular control)
  const componentSuffix = suffixes[componentType];

  // If component-specific suffix is not defined, use default
  if (componentSuffix === undefined) {
    return DEFAULT_SUFFIXES[componentType];
  }

  // If component suffix is boolean
  if (typeof componentSuffix === 'boolean') {
    return componentSuffix ? DEFAULT_SUFFIXES[componentType] : '';
  }

  // If component suffix is a custom string
  return componentSuffix;
}
