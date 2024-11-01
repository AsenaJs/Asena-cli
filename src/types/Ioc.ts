import type {BuildOptions} from "./Build";

export interface IocConfig {
  sourceFolder: string;
  rootFile: string;
  buildOptions?: BuildOptions;
}
