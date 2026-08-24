export type Class<T = any> = new (...args: any[]) => T;

export interface ComponentExport {
  exportName: string;
  Class: Class;
}

export interface ControllerPath {
  [key: string]: ComponentExport[];
}

export interface ImportsByFiles {
  [key: string]: string[];
}

export enum ImportType {
  IMPORT,
  REQUIRE,
}
