import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { toImportPath, writeWrapperFiles } from '../../lib/helpers/wrapperHelper';

describe('writeWrapperFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-wrapper-helper-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const root = path.join(os.tmpdir(), 'some-project');

  it('resolves component and entry imports against the given root, not the cwd', () => {
    const entry = writeWrapperFiles(dir, {
      root,
      sourceFolder: 'src',
      rootFile: 'src/index.ts',
      controllers: { 'ItemService.ts': [{ exportName: 'ItemService' }] },
    });

    expect(entry).toBe(path.join(dir, 'index.asena.js'));
    expect(fs.readFileSync(path.join(dir, 'asena.components.js'), 'utf-8')).toContain(
      `import { ItemService as c0 } from '${toImportPath(path.join(root, 'src', 'ItemService.ts'))}';`,
    );
    expect(fs.readFileSync(entry, 'utf-8')).toBe(
      `import './asena.components.js';\nimport '${toImportPath(path.join(root, 'src', 'index.ts'))}';\n`,
    );
  });

  it('writes each prelude and imports them in order before the components and the entry', () => {
    const entry = writeWrapperFiles(dir, {
      root,
      sourceFolder: 'src',
      rootFile: 'src/index.ts',
      controllers: {},
      preludes: { 'first.js': 'export const a = 1;\n', 'second.js': 'export const b = 2;\n' },
    });

    expect(fs.readFileSync(path.join(dir, 'first.js'), 'utf-8')).toBe('export const a = 1;\n');
    expect(fs.readFileSync(path.join(dir, 'second.js'), 'utf-8')).toBe('export const b = 2;\n');
    expect(fs.readFileSync(entry, 'utf-8')).toBe(
      [
        `import './first.js';`,
        `import './second.js';`,
        `import './asena.components.js';`,
        `import '${toImportPath(path.join(root, 'src', 'index.ts'))}';`,
        '',
      ].join('\n'),
    );
  });

  it('turns backslashes into forward slashes', () => {
    expect(toImportPath('C:\\app\\src\\index.ts')).toBe('C:/app/src/index.ts');
  });
});
