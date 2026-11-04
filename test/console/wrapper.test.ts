import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isSupportedCoreVersion, resolveDevtoolsAgent } from '../../lib/console/coreVersion';
import { appCommand, DEVTOOLS_PRELUDE_FILE, writeConsoleWrapper } from '../../lib/console/wrapper';
import { toImportPath } from '../../lib/helpers/wrapperHelper';
import { FIXTURE_DIR } from '../utils/fixtureCopy';

describe('console wrapper', () => {
  let project: string;
  let wrapperDir: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-project-'));
    wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-wrapper-'));
    fs.mkdirSync(path.join(project, 'src'));
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(wrapperDir, { recursive: true, force: true });
  });

  const writeAgent = (source: string) => {
    const agentPath = path.join(project, 'agent.js');

    fs.writeFileSync(agentPath, source);

    return agentPath;
  };

  it('imports the components, then the devtools prelude, then the entry, all by absolute path', () => {
    const agentPath = writeAgent('export const attachDevtoolsAgent = () => {};\n');

    const entry = writeConsoleWrapper(wrapperDir, {
      root: project,
      sourceFolder: 'src',
      rootFile: 'src/index.ts',
      controllers: { 'ItemService.ts': [{ exportName: 'ItemService', Class: class ItemService {} }] },
      agentPath,
    });

    const entrySource = fs.readFileSync(entry, 'utf-8');
    const prelude = fs.readFileSync(path.join(wrapperDir, DEVTOOLS_PRELUDE_FILE), 'utf-8');
    const components = fs.readFileSync(path.join(wrapperDir, 'asena.components.js'), 'utf-8');

    expect(entrySource).toBe(
      [
        `import './asena.components.js';`,
        `import './${DEVTOOLS_PRELUDE_FILE}';`,
        `import '${toImportPath(path.join(project, 'src', 'index.ts'))}';`,
        '',
      ].join('\n'),
    );
    expect(prelude).toContain(`import * as devtools from '${toImportPath(agentPath)}';`);
    expect(prelude).toContain(`globalThis[Symbol.for('asena.devtools')] = devtools.attachDevtoolsAgent;`);
    expect(components).toContain(`from '${toImportPath(path.join(project, 'src', 'ItemService.ts'))}'`);

    for (const source of [entrySource, prelude, components]) {
      expect(source).not.toMatch(/from '@|import '@/);
    }
  });

  const runWrapper = async (agentSource: string) => {
    const agentPath = writeAgent(agentSource);

    // A top-level await in the entry: the hook must already be set when the entry body runs.
    fs.writeFileSync(
      path.join(project, 'src', 'index.js'),
      [
        'await Promise.resolve();',
        "const hook = globalThis[Symbol.for('asena.devtools')];",
        'console.log(JSON.stringify({ hook: typeof hook, name: hook?.name ?? null }));',
        '',
      ].join('\n'),
    );

    const entry = writeConsoleWrapper(wrapperDir, {
      root: project,
      sourceFolder: 'src',
      rootFile: 'src/index.js',
      controllers: {},
      agentPath,
    });

    const child = Bun.spawn(appCommand(project, entry), { cwd: project, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { output: JSON.parse(stdout.trim()) as { hook: string; name: string | null }, stderr, code };
  };

  it('sets the hook to the agent factory before the entry runs', async () => {
    const { output, code } = await runWrapper('export function attachDevtoolsAgent() {}\n');

    expect(code).toBe(0);
    expect(output).toEqual({ hook: 'function', name: 'attachDevtoolsAgent' });
  });

  it('warns and leaves the hook unset when the agent module has no factory export', async () => {
    const { output, stderr, code } = await runWrapper('export const somethingElse = 1;\n');

    expect(code).toBe(0);
    expect(output.hook).toBe('undefined');
    expect(stderr).toContain('has no attachDevtoolsAgent export');
  });

  it('runs bun with the project tsconfig as an override when the project has one', () => {
    const entry = path.join(wrapperDir, 'index.asena.js');

    expect(appCommand(project, entry, 'bun')).toEqual(['bun', entry]);

    fs.writeFileSync(path.join(project, 'tsconfig.json'), '{}');

    expect(appCommand(project, entry, 'bun')).toEqual([
      'bun',
      `--tsconfig-override=${path.join(project, 'tsconfig.json')}`,
      entry,
    ]);
  });

  it('resolves @asenajs/asena/devtools from the project root', () => {
    const core = path.join(project, 'node_modules', '@asenajs', 'asena');

    fs.mkdirSync(core, { recursive: true });
    fs.writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({ name: '@asenajs/asena', version: '0.13.0', exports: { './devtools': './devtools.js' } }),
    );
    fs.writeFileSync(path.join(core, 'devtools.js'), 'export {};');

    expect(resolveDevtoolsAgent(project)).toBe(fs.realpathSync(path.join(core, 'devtools.js')));
  });

  it('finds no devtools agent in a core that predates it', () => {
    expect(resolveDevtoolsAgent(FIXTURE_DIR)).toBeNull();
  });
});

describe('isSupportedCoreVersion', () => {
  it('accepts the 0.13 line, prereleases included, and nothing else', () => {
    expect(isSupportedCoreVersion('0.13.0')).toBe(true);
    expect(isSupportedCoreVersion('0.13.7')).toBe(true);
    expect(isSupportedCoreVersion('0.13.0-next.1')).toBe(true);
    expect(isSupportedCoreVersion('0.12.4')).toBe(false);
    expect(isSupportedCoreVersion('0.14.0')).toBe(false);
    expect(isSupportedCoreVersion('not a version')).toBe(false);
  });
});
