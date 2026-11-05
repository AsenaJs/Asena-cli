// Re-records the fixtures with the Bun in use: `bun test/console/fixtures/bun-output/capture.ts`.
import fs from 'fs';
import path from 'path';

export const BUN_OUTPUT_CASES = [
  'console-error',
  'cause',
  'logger',
  'custom',
  'error-object',
  'trace',
  'logs',
  'uncaught',
] as const;

export type BunOutputCase = (typeof BUN_OUTPUT_CASES)[number];

/** The fixture path every absolute path to this directory is rewritten to, so the fixtures do not name a machine. */
export const FIXTURE_DIR = '/app/';

const program = path.join(import.meta.dir, 'errors.ts');

export const runCase = async (name: BunOutputCase): Promise<{ stdout: string; stderr: string }> => {
  const child = Bun.spawn([process.execPath, program, name], {
    cwd: import.meta.dir,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);

  await child.exited;

  return { stdout, stderr };
};

if (import.meta.main) {
  for (const name of BUN_OUTPUT_CASES) {
    const output = await runCase(name);

    for (const stream of ['stdout', 'stderr'] as const) {
      const text = output[stream].replaceAll(`${import.meta.dir}${path.sep}`, FIXTURE_DIR);

      fs.writeFileSync(path.join(import.meta.dir, `${name}.${stream}.txt`), text);
    }
  }
}
