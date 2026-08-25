import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Build } from '../../lib/commands/Build';
import { spawn } from 'bun';
import { copySampleApp, findAsenaJsFiles, FIXTURE_DIR, listFilesRecursively } from '../utils/fixtureCopy';

describe('Build integration (sample-app fixture)', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(path.join(FIXTURE_DIR, 'dist'), { recursive: true, force: true });
  });

  it('bundles the project through the wrapper entry and leaves src/ untouched', async () => {
    const srcBefore = listFilesRecursively(path.join(FIXTURE_DIR, 'src'));

    process.chdir(FIXTURE_DIR);

    const outputPath = await new Build().build();

    expect(outputPath).toBe(path.join(FIXTURE_DIR, 'dist', 'index.asena.js'));
    expect(fs.existsSync(outputPath)).toBe(true);

    const bundle = fs.readFileSync(outputPath, 'utf-8');

    expect(bundle).toContain('asena.buildComponents');
    expect(bundle).toContain('TestService');
    expect(bundle).toContain('TestController');

    expect(findAsenaJsFiles(path.join(FIXTURE_DIR, 'src'))).toEqual([]);
    expect(listFilesRecursively(path.join(FIXTURE_DIR, 'src'))).toEqual(srcBefore);
  });

  it('does not execute entry module code during the build (#25)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-build-it-'));

    try {
      copySampleApp(tmpDir);

      fs.appendFileSync(path.join(tmpDir, 'src', 'index.ts'), "console.log('SIDE-EFFECT');\n");

      process.chdir(tmpDir);

      const logs: string[] = [];
      const originalLog = console.log;

      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      };

      let outputPath = '';

      try {
        outputPath = await new Build().build();
      } finally {
        console.log = originalLog;
      }

      expect(logs.join('\n')).not.toContain('SIDE-EFFECT');
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(findAsenaJsFiles(path.join(tmpDir, 'src'))).toEqual([]);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
  it('boots the bundle from the build component list when the installed core supports it', async () => {
    const registry = path.join(FIXTURE_DIR, 'node_modules', '@asenajs', 'asena', 'dist', 'lib', 'ioc', 'component');
    const supportsBuildList =
      fs.existsSync(registry) &&
      fs
        .readdirSync(registry)
        .filter((f) => f.endsWith('.js'))
        .some((f) => fs.readFileSync(path.join(registry, f), 'utf-8').includes('asena.buildComponents'));

    if (!supportsBuildList) {
      console.log('skipped: the fixture core predates the build component list (asena.buildComponents)');

      return;
    }

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-build-boot-'));
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-build-run-'));

    try {
      copySampleApp(projectDir);

      const entry = path.join(projectDir, 'src', 'index.ts');

      fs.writeFileSync(entry, fs.readFileSync(entry, 'utf-8').replace('port: 3000', 'port: 0'));
      process.chdir(projectDir);

      const outputPath = await new Build().build();

      // No src/, no asena-config: the only way to find TestController is the build list
      fs.copyFileSync(outputPath, path.join(runDir, 'index.asena.js'));

      const child = spawn(['bun', 'index.asena.js'], { cwd: runDir, stdout: 'pipe', stderr: 'pipe' });
      let output = '';
      const deadline = Date.now() + 15_000;
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();

      try {
        while (!/Server running at http:\/\/localhost:\d+/.test(output) && Date.now() < deadline) {
          const chunk = await Promise.race([reader.read(), Bun.sleep(250).then(() => null)]);

          if (chunk?.value) output += decoder.decode(chunk.value);
          if (chunk?.done) break;
        }

        const port = output.match(/Server running at http:\/\/localhost:(\d+)/)?.[1];

        expect(port).toBeDefined();

        const response = await fetch(`http://localhost:${port}/test`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: 'test controller' });
      } finally {
        child.kill();
        await child.exited;
      }
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }, 20_000);
});
