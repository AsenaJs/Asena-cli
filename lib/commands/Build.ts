import fs from 'fs';
import os from 'os';
import path from 'path';
import { type BuildConfig, type BunPlugin } from 'bun';
import { Command } from 'commander';
import { ConfigHandler } from '../codeBuilder';
import { checkControllerExistence, getControllers } from '../helpers';
import type { AsenaConfig, BuildOptions, ControllerPath } from '../types';
import type { BaseCommand } from '../types/baseCommand';

export class Build implements BaseCommand {
  private configFile: AsenaConfig = { rootFile: '', sourceFolder: '' };

  public command() {
    return new Command('build')
      .description('For building the project and preparing it for production deployment')
      .action(async () => {
        try {
          await this.build();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  /**
   * Builds the project without touching the entry file: a temporary wrapper entry
   * (outside sourceFolder) imports every scanned component into
   * `globalThis[Symbol.for('asena.buildComponents')]` before importing the entry,
   * and the bundler runs on that wrapper.
   *
   * @returns The absolute path of the bundled output file.
   */
  public async build(): Promise<string> {
    this.configFile = (await new ConfigHandler().exec()).configFile;

    const controllers = await getControllers(this.configFile.rootFile, this.configFile.sourceFolder);

    if (!checkControllerExistence(controllers)) {
      console.error('\x1b[31m%s\x1b[0m', 'No components has found');

      process.exit(1);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-build-'));

    try {
      this.writeWrapperFiles(tmpDir, controllers);

      await this.executeBuild(tmpDir);

      await this.copyIncludedAssets();

      console.log('Build completed successfully.');

      return this.getOutputPath();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private writeWrapperFiles(tmpDir: string, controllers: ControllerPath) {
    const imports: string[] = [];
    const aliases: string[] = [];

    let index = 0;

    for (const [file, components] of Object.entries(controllers)) {
      const sourcePath = path.resolve(process.cwd(), this.configFile.sourceFolder, file);

      for (const { exportName } of components) {
        const alias = `c${index++}`;

        imports.push(`import { ${exportName} as ${alias} } from '${sourcePath}';`);
        aliases.push(alias);
      }
    }

    fs.writeFileSync(
      path.join(tmpDir, 'asena.components.js'),
      `${imports.join('\n')}\n\nglobalThis[Symbol.for('asena.buildComponents')] = [${aliases.join(', ')}];\n`,
    );

    fs.writeFileSync(
      path.join(tmpDir, 'index.asena.js'),
      `import './asena.components.js';\nimport '${path.resolve(process.cwd(), this.configFile.rootFile)}';\n`,
    );
  }

  private getOutputPath(): string {
    const outdir = this.configFile.buildOptions?.outdir || './out';

    return path.resolve(process.cwd(), outdir, 'index.asena.js');
  }

  /**
   * Component names are read at runtime (@Inject('UserService'),
   * @Repository({ databaseService: 'MainDb' })), so identifiers must not be minified.
   * `keepNames` is not the answer: Bun's bundler (1.4.0) does not preserve class names
   * under identifier minification even with it set, measured on a one-class entry.
   * Returns the replacement `minify` value, or undefined to keep the user's value as-is.
   */
  private normalizeMinify(minify: BuildOptions['minify']): BuildOptions['minify'] | undefined {
    if (minify === true) {
      return { whitespace: true, syntax: true, identifiers: false };
    }

    if (typeof minify === 'object' && minify !== null && minify.identifiers === true) {
      console.log('[build] minify.identifiers disabled: component names are read at runtime');

      return { ...minify, identifiers: false };
    }

    return undefined;
  }

  private async executeBuild(tmpDir: string) {
    const buildResult = await this.buildWithBunAPI(tmpDir);

    if (!buildResult.success) {
      throw new Error(JSON.stringify(buildResult.logs));
    }
  }

  private buildWithBunAPI = async (tmpDir: string) => {
    const asenaFooter = `/*
 * ╔═══════════════════════════════════════╗
 * ║     ⚡ Built with Asena Framework      ║
 * ║   https://github.com/AsenaJs/Asena    ║
 * ╚═══════════════════════════════════════╝
 */`;

    const { plugin: htmlPlugin, htmlImports } = this.createHTMLPlugin();

    const entrypoint = path.join(tmpDir, 'index.asena.js');

    // `root` is explicit so the output name never depends on Bun's inferred common ancestor.
    let finalBuildConfig: BuildConfig;

    if (this.configFile.buildOptions) {
      const normalizedMinify = this.normalizeMinify(this.configFile.buildOptions.minify);

      finalBuildConfig = {
        ...this.configFile.buildOptions,
        ...(normalizedMinify !== undefined ? { minify: normalizedMinify } : {}),
        entrypoints: [entrypoint],
        root: tmpDir,
        target: 'bun',
        footer: asenaFooter,
        plugins: [htmlPlugin],
      };
    } else {
      finalBuildConfig = {
        entrypoints: [entrypoint],
        root: tmpDir,
        outdir: './out',
        target: 'bun',
        footer: asenaFooter,
        plugins: [htmlPlugin],
      };
    }

    const result = await Bun.build(finalBuildConfig);

    if (result.success && htmlImports.size > 0) {
      const outdir = this.configFile.buildOptions?.outdir || './out';

      this.rewriteHTMLImports(outdir, htmlImports);
    }

    return result;
  };

  /**
   * Creates a Bun build plugin that marks .html imports as external and collects
   * path mappings for post-build rewriting.
   *
   * Bun's bundler preserves the original import specifier for external modules,
   * so path rewrites from onResolve are NOT applied to the output.
   * The collected htmlImports map is used by rewriteHTMLImports() after the build.
   */
  private createHTMLPlugin(): { plugin: BunPlugin; htmlImports: Map<string, string> } {
    const htmlImports = new Map<string, string>();

    const plugin: BunPlugin = {
      name: 'asena-html-resolver',
      setup(build) {
        build.onResolve({ filter: /\.html$/ }, (args) => {
          const absolutePath = path.resolve(path.dirname(args.importer), args.path);

          if (!fs.existsSync(absolutePath)) {
            throw new Error(`HTML file not found: ${absolutePath} (imported from ${args.importer})`);
          }

          const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
          const rewrittenPath = './' + relativePath;

          htmlImports.set(args.path, rewrittenPath);

          return {
            path: rewrittenPath,
            external: true,
          };
        });
      },
    };

    return { plugin, htmlImports };
  }

  /**
   * Rewrites HTML import paths in the build output files.
   * Bun preserves original import specifiers for external modules,
   * so we need to fix them post-build to match the copied file locations.
   */
  private rewriteHTMLImports(outdir: string, htmlImports: Map<string, string>) {
    const outputFiles = fs.readdirSync(outdir).filter((f) => f.endsWith('.js'));

    for (const file of outputFiles) {
      const filePath = path.join(outdir, file);
      let content = fs.readFileSync(filePath, 'utf-8');
      let modified = false;

      for (const [originalPath, rewrittenPath] of htmlImports) {
        if (content.includes(`"${originalPath}"`)) {
          content = content.replaceAll(`"${originalPath}"`, `"${rewrittenPath}"`);
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
      }
    }
  }

  /**
   * Copies files and directories listed in the `include` config to the output directory.
   * Directories are copied recursively, preserving their structure.
   */
  private async copyIncludedAssets() {
    const include = this.configFile.include;

    if (!include || include.length === 0) {
      return;
    }

    const outdir = this.configFile.buildOptions?.outdir || './out';

    for (const entry of include) {
      const srcPath = path.resolve(process.cwd(), entry);
      const destPath = path.join(outdir, entry);

      if (!fs.existsSync(srcPath)) {
        console.warn(`\x1b[33m[include]\x1b[0m Skipping "${entry}" — path not found`);

        continue;
      }

      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private copyDirRecursive(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true });

    for (const entry of fs.readdirSync(src)) {
      const srcEntry = path.join(src, entry);
      const destEntry = path.join(dest, entry);

      if (fs.statSync(srcEntry).isDirectory()) {
        this.copyDirRecursive(srcEntry, destEntry);
      } else {
        fs.copyFileSync(srcEntry, destEntry);
      }
    }
  }
}
