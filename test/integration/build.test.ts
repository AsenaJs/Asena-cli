import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Build } from '../../lib/commands/Build';
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
});
