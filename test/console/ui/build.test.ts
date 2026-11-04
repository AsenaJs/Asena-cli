import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { buildConsoleUi } from '../../../console-ui/build';

describe('console UI build', () => {
  let outdir: string;
  let outputs: string[];

  beforeAll(async () => {
    outdir = await mkdtemp(join(tmpdir(), 'asena-console-ui-'));
    await writeFile(join(outdir, 'stale.js'), '');
    outputs = await buildConsoleUi(outdir);
  });

  afterAll(async () => {
    await rm(outdir, { recursive: true, force: true });
  });

  test('writes index.html at the top and everything else under assets/', async () => {
    const files = (await readdir(outdir, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => relative(outdir, join(entry.parentPath, entry.name)))
      .sort();

    expect(files).toContain('index.html');
    expect(files.filter((file) => file !== 'index.html').every((file) => file.startsWith('assets/'))).toBe(true);
    expect(files.some((file) => file.endsWith('.js'))).toBe(true);
    expect(files.some((file) => file.endsWith('.css'))).toBe(true);
    expect(outputs.map((output) => relative(outdir, output)).sort()).toEqual(files);
  });

  test('index.html loads its script and stylesheet from /assets/', async () => {
    const html = await readFile(join(outdir, 'index.html'), 'utf8');
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);

    expect(references.length).toBeGreaterThanOrEqual(2);
    expect(references.every((reference) => reference?.startsWith('/assets/'))).toBe(true);
  });

  test('loads nothing from the network, so the console works offline', async () => {
    const texts = await Promise.all(outputs.map((output) => readFile(output, 'utf8')));
    const remote = /(?:@import\s*(?:url\(\s*)?['"]?|url\(\s*['"]?|import\(\s*['"]|src=["']|href=["'])(?:https?:)?\/\//i;

    expect(texts.filter((text) => remote.test(text))).toEqual([]);
  });

  test('bundles React for production', async () => {
    const script = outputs.find((output) => output.endsWith('.js'));
    const source = await readFile(script ?? '', 'utf8');

    expect(source).not.toContain('process.env.NODE_ENV');
    expect(source).toContain('Minified React error');
  });
});
