import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const VENDORED = join(REPO_ROOT, 'lib', 'console', 'protocol.ts');
const CORE_RELATIVE = join('lib', 'devtools', 'protocol.ts');

// ASENA_CORE_DIR names the core checkout to compare against; without it, the monorepo sibling is used if present.
const explicitCoreDir = process.env['ASENA_CORE_DIR'];
const coreProtocol = explicitCoreDir
  ? join(resolve(explicitCoreDir), CORE_RELATIVE)
  : join(REPO_ROOT, '..', 'Asena', CORE_RELATIVE);
const compareWithCore = explicitCoreDir !== undefined || existsSync(coreProtocol);

describe('console protocol copy', () => {
  test('imports nothing, so the copy stays byte-identical to core', () => {
    const source = readFileSync(VENDORED, 'utf8');

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  test.skipIf(!compareWithCore)('is byte-identical to core lib/devtools/protocol.ts', () => {
    expect(existsSync(coreProtocol)).toBe(true);
    expect(readFileSync(VENDORED, 'utf8')).toBe(readFileSync(coreProtocol, 'utf8'));
  });
});
