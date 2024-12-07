import type { InitSetupOptions } from './init';

export interface ProjectSetupOptions {
  projectName: string;
  eslint: boolean;
  prettier: boolean;
  config: InitSetupOptions;
}
