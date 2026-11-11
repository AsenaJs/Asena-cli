import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const CONSOLE_UI_ENTRY = join(import.meta.dir, 'index.html');

export const CONSOLE_UI_OUTDIR = resolve(import.meta.dir, '..', 'dist', 'console-ui');

/** Bundles the console SPA into `outdir`: `index.html` at the top, everything it loads under `assets/`. */
export const buildConsoleUi = async (outdir: string = CONSOLE_UI_OUTDIR): Promise<string[]> => {
  await rm(outdir, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [CONSOLE_UI_ENTRY],
    outdir,
    target: 'browser',
    minify: true,
    publicPath: '/',
    naming: {
      entry: '[name].[ext]',
      chunk: 'assets/[name]-[hash].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'console UI build failed');
  }

  return result.outputs.map((output) => output.path);
};

if (import.meta.main) {
  await buildConsoleUi();
}
