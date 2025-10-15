import { $ } from 'bun';
import type { AdapterConfig, AdapterType } from '../types/adapterConfig';

const CONFIG_DIR = '.asena';
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;

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
  } catch (error) {
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