import type { AdapterType } from './adapterConfig';

export interface ProjectSetupOptions {
  projectName: string;
  adapter: AdapterType;
  logger: boolean;
  eslint: boolean;
  format: boolean;
}
