import fs from 'node:fs';
import path from 'node:path';
import type { AsenaConfig } from '../types';

export const isAsenaConfigExists = () => {
  return fs.existsSync(path.normalize(`${process.cwd()}/asena-config.ts`));
};

export const readJson = (path: string) => {
  const file = Bun.file(path, { type: 'application/json' });

  return file.json();
};

export const getAsenaCliVersion = async (): Promise<string | null> => {
  if (!isAsenaConfigExists()) {
    return null;
  }

  const packageJson = await readJson(`${process.cwd()}/asena-config.ts`);

  return packageJson.devDependencies['@asenajs/asena-cli'];
};

export const defineConfig = (config: AsenaConfig) => {
  return config;
};
