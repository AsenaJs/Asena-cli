import type { BuildOptions } from './build';

export interface AsenaConfig {
  sourceFolder: string;
  rootFile: string;
  buildOptions?: BuildOptions;
}
