import fs from 'fs';
import path from 'path';
import type { ComponentExport } from '../types';

/** Component export names by file, the file relative to the source folder. */
export type ComponentExports = Record<string, Pick<ComponentExport, 'exportName'>[]>;

// Backslashes inside a quoted import specifier are escape sequences, so a Windows path
// would be mangled; forward slashes resolve on every platform
export const toImportPath = (absolute: string): string => absolute.replace(/\\/g, '/');

export interface WrapperOptions {
  /** Absolute project root; `sourceFolder` and `rootFile` are relative to it. */
  root: string;
  sourceFolder: string;
  rootFile: string;
  controllers: ComponentExports;
  /**
   * Extra modules written next to the wrapper, file name -> source, imported in order before any module of the
   * app, so a prelude cannot use the components.
   */
  preludes?: Record<string, string>;
}

/**
 * Writes the wrapper entry into `dir`: each prelude runs, then `asena.components.js` fills
 * `globalThis[Symbol.for('asena.buildComponents')]` with every scanned component, then the entry is
 * imported. Every import is an absolute path, so the wrapper can live outside the project.
 *
 * @returns The absolute path of the wrapper entry, `index.asena.js`.
 */
export const writeWrapperFiles = (dir: string, options: WrapperOptions): string => {
  const imports: string[] = [];
  const aliases: string[] = [];

  let index = 0;

  for (const [file, components] of Object.entries(options.controllers)) {
    const sourcePath = toImportPath(path.resolve(options.root, options.sourceFolder, file));

    for (const { exportName } of components) {
      const alias = `c${index++}`;

      imports.push(`import { ${exportName} as ${alias} } from '${sourcePath}';`);
      aliases.push(alias);
    }
  }

  fs.writeFileSync(
    path.join(dir, 'asena.components.js'),
    `${imports.join('\n')}\n\nglobalThis[Symbol.for('asena.buildComponents')] = [${aliases.join(', ')}];\n`,
  );

  const entryImports: string[] = [];

  for (const [file, source] of Object.entries(options.preludes ?? {})) {
    fs.writeFileSync(path.join(dir, file), source);
    entryImports.push(`import './${file}';`);
  }

  entryImports.push(
    `import './asena.components.js';`,
    `import '${toImportPath(path.resolve(options.root, options.rootFile))}';`,
  );

  const entry = path.join(dir, 'index.asena.js');

  fs.writeFileSync(entry, `${entryImports.join('\n')}\n`);

  return entry;
};
