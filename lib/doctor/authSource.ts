import fs from 'node:fs';
import path from 'node:path';
import { getAllFiles } from '../helpers';

export const CORE_AUTH_MODULE = '@asenajs/asena/auth';
export const AUTH_PACKAGE = '@asenajs/asena-auth';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

const SKIPPED_DIRS = ['dist'];

export interface SourceFile {
  /** Path relative to the project root, with forward slashes. */
  relPath: string;
  /** File contents with comments blanked out; offsets and line numbers match the original. */
  code: string;
}

const isScanned = (relPath: string): boolean =>
  SOURCE_EXTENSIONS.some((ext) => relPath.endsWith(ext)) &&
  !relPath.endsWith('.d.ts') &&
  !relPath.split('/').some((segment) => SKIPPED_DIRS.includes(segment));

export const stripComments = (source: string): string => {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;

      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;

      while (j < source.length && source[j] !== char && !(char !== '`' && source[j] === '\n')) {
        j += source[j] === '\\' ? 2 : 1;
      }

      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += char;
      i++;
    }
  }

  return out;
};

/** Reads every source file under `cwd`, skipping node_modules, dist and declaration files. */
export const readSourceFiles = (cwd: string): SourceFile[] =>
  getAllFiles(cwd)
    .map((file) => path.relative(cwd, file).split(path.sep).join('/'))
    .filter(isScanned)
    .map((relPath) => ({ relPath, code: stripComments(fs.readFileSync(path.join(cwd, relPath), 'utf8')) }));

export const lineOf = (code: string, offset: number): number => code.slice(0, offset).split('\n').length;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export interface ImportedName {
  /** The name the module exports. */
  imported: string;
  /** The binding in the importing file. */
  local: string;
  line: number;
}

/**
 * Value bindings `code` takes from `moduleName` through `import { ... }` or `export { ... } from`,
 * plus `ns.name` accesses on an `import * as ns` of it. Type-only imports are not bindings.
 */
export const importsFrom = (code: string, moduleName: string): ImportedName[] => {
  const quoted = (group: number): string => `(['"])${escapeRegExp(moduleName)}\\${group}`;
  const named = new RegExp(
    `\\b(?:import\\s+(?:[\\w$]+\\s*,\\s*)?|export\\s+)(type\\s+)?\\{([^}]*)\\}\\s*from\\s*${quoted(3)}`,
    'g',
  );
  const namespace = new RegExp(`\\bimport\\s+\\*\\s+as\\s+([\\w$]+)\\s+from\\s*${quoted(2)}`, 'g');
  const found: ImportedName[] = [];

  for (const match of code.matchAll(named)) {
    if (match[1]) {
      continue;
    }

    for (const part of match[2].split(',')) {
      const binding = /^\s*(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);

      if (binding && !binding[1]) {
        found.push({ imported: binding[2], local: binding[3] ?? binding[2], line: lineOf(code, match.index) });
      }
    }
  }

  for (const match of code.matchAll(namespace)) {
    const ns = match[1];

    for (const access of code.matchAll(new RegExp(`(?<![\\w$.])${escapeRegExp(ns)}\\s*\\.\\s*([\\w$]+)`, 'g'))) {
      found.push({ imported: access[1], local: `${ns}.${access[1]}`, line: lineOf(code, access.index) });
    }
  }

  return found;
};

export interface PackageDeps {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Declared dependencies and devDependencies; a missing or unparsable package.json declares none. */
export const readDeclaredDeps = (cwd: string): Set<string> => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as PackageDeps;

    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    return new Set();
  }
};
