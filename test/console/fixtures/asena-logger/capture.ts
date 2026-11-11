// Re-records run.stdout.txt: `bun test/console/fixtures/asena-logger/capture.ts <project with @asenajs/asena-logger>`.
import fs from 'fs';
import path from 'path';

const project = path.resolve(process.argv[2] ?? '.');
const child = Bun.spawn([process.execPath, path.join(import.meta.dir, 'write.ts'), project], {
  cwd: project,
  stdout: 'pipe',
  stderr: 'pipe',
});
const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);

await child.exited;

if (stderr !== '') throw new Error(`The logger wrote to stderr:\n${stderr}`);

fs.writeFileSync(
  path.join(import.meta.dir, 'run.stdout.txt'),
  stdout.replaceAll(`${import.meta.dir}${path.sep}`, '/app/').replaceAll(`${project}${path.sep}`, '/app/'),
);
