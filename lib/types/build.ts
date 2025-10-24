export type Class<T = any> = new (...args: any[]) => T;

export interface ControllerPath {
  [key: string]: Class[];
}

export interface ImportsByFiles {
  [key: string]: string[];
}

export enum ImportType {
  IMPORT,
  REQUIRE,
}
