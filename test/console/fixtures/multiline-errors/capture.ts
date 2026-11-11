// Re-records the fixtures: `bun test/console/fixtures/multiline-errors/capture.ts <asena-logger entry> <zod directory>`.
import fs from 'fs';
import path from 'path';

const [logger, zod] = process.argv.slice(2).map((arg) => path.resolve(arg));

if (!logger || !zod) throw new Error('Pass the path of @asenajs/asena-logger and of zod');

const child = Bun.spawn([process.execPath, path.join(import.meta.dir, 'write.ts'), logger, zod], {
  cwd: import.meta.dir,
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  stdout: 'pipe',
  stderr: 'pipe',
});
const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);

await child.exited;

for (const [name, text] of [
  ['run.stdout.txt', stdout],
  ['run.stderr.txt', stderr],
] as const) {
  fs.writeFileSync(path.join(import.meta.dir, name), text.replaceAll(`${import.meta.dir}${path.sep}`, '/app/'));
}
