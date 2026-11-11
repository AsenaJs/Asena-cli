import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ComponentExports } from '../helpers/wrapperHelper';
import { appCommand } from './wrapper';

const SCAN_WORKER = path.join(import.meta.dir, `scanWorker${path.extname(import.meta.path)}`);

export interface ComponentScanOptions {
  root: string;
  sourceFolder: string;
  rootFile: string;
  bun?: string;
}

type WorkerResult = { ok: true; components: ComponentExports } | { ok: false; error: string };

const readResult = (file: string): WorkerResult | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as WorkerResult;
  } catch {
    return null;
  }
};

/**
 * Scans the project's components in a new bun process. A module cache lives as long as its process, so only a
 * fresh process reads every module from disk again, including the ones a scanned file imports.
 */
export const scanComponents = async (options: ComponentScanOptions): Promise<ComponentExports> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-scan-'));
  const out = path.join(dir, 'components.json');

  try {
    const worker = Bun.spawn(
      [...appCommand(options.root, SCAN_WORKER, options.bun), options.rootFile, options.sourceFolder, out],
      { cwd: options.root, stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
    );
    const [code, stderr] = await Promise.all([worker.exited, new Response(worker.stderr).text()]);
    const result = readResult(out);

    if (result?.ok) return result.components;

    throw new Error(result?.error ?? (stderr.trim() || `The component scan exited with code ${code}`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
