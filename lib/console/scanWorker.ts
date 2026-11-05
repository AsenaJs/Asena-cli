// Run by ./scan in a fresh bun process: argv = rootFile, sourceFolder, result file. The cwd is the project root.
import fs from 'fs';
import { getControllers } from '../helpers/controllerHelper';

const [rootFile, sourceFolder, out] = process.argv.slice(2);

if (!rootFile || !sourceFolder || !out) {
  console.error('usage: scanWorker <rootFile> <sourceFolder> <out>');
  process.exit(2);
}

try {
  const components = await getControllers(rootFile, sourceFolder);
  const names = Object.fromEntries(
    Object.entries(components).map(([file, exports]) => [file, exports.map(({ exportName }) => ({ exportName }))]),
  );

  fs.writeFileSync(out, JSON.stringify({ ok: true, components: names }));
} catch (error) {
  fs.writeFileSync(out, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
