import type { BunPlugin, Loader, Target } from 'bun';

export type Class<T = any> = new (...args: any[]) => T;

export interface Components {
  [path: string]: Class[];
}

export interface BuildOptions {
  executable?: boolean;
  outdir?: string;
  target?: Target;
  format?: 'esm' | 'cjs' | 'iife';
  naming?:
    | string
    | {
        chunk?: string;
        entry?: string;
        asset?: string;
      };
  root?: string;
  splitting?: boolean;
  plugins?: BunPlugin[];
  external?: string[];
  packages?: 'bundle' | 'external';
  publicPath?: string;
  define?: Record<string, string>;
  loader?: { [k in string]: Loader };
  sourcemap?: 'none' | 'linked' | 'inline' | 'external' | 'linked';
  conditions?: Array<string> | string;
  minify?:
    | boolean
    | {
        whitespace?: boolean;
        syntax?: boolean;
        identifiers?: boolean;
      };
  ignoreDCEAnnotations?: boolean;
  emitDCEAnnotations?: boolean;
}
