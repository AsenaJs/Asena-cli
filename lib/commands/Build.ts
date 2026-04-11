import fs from 'fs';
import path from 'path';
import { type BuildConfig, type BunPlugin, write } from 'bun';
import { Command } from 'commander';
import { AsenaServerHandler, ConfigHandler, ImportHandler } from '../codeBuilder';
import {
  changeFileExtensionToAsenaJs,
  checkControllerExistence,
  getControllers,
  getImportType,
  RegexHelper,
  simplifyPath,
} from '../helpers';
import type { AsenaConfig, ControllerPath, ImportsByFiles } from '../types';
import type { BaseCommand } from '../types/baseCommand';

export class Build implements BaseCommand {
  private _buildFilePath = '';

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

  public async build() {
    try {
      this.configFile = (await new ConfigHandler().exec()).configFile;

      this._buildFilePath = this.createBuildFilePath();

      const { rootFileCode, injections } = await this.readAndPrepareCode();

      const buildCode = await this.buildCode(rootFileCode, injections);

      await write(this._buildFilePath, buildCode);

      await this.executeBuild();

      await this.copyIncludedAssets();

      this.removeAsenaEntryFile();

      console.log('Build completed successfully.');
    } catch (e) {
      this.removeAsenaEntryFile();

      console.error('Build failed:', e);
    }
  }

  private removeAsenaEntryFile = () => {
    try {
      fs.unlinkSync(path.normalize(this._buildFilePath));
    } catch {
      console.log('No asena entry file has found');
    }
  };

  private async buildCode(rootFileCode: string, components: ControllerPath) {
    const importType = await getImportType();

    const { cleanedCode, asenaServerCodeBlock } = this.cleanCodeAndExtractServer(rootFileCode);

    const importHandler = new ImportHandler(cleanedCode, importType);

    const { imports, allComponents } = this.prepareImports(components);

    const code = importHandler.importToCode(imports, importType);

    const asenaServer = new AsenaServerHandler(asenaServerCodeBlock).addComponents(allComponents);

    return code + asenaServer;
  }

  private cleanCodeAndExtractServer(rootFileCode: string) {
    const cleanedCode = RegexHelper.removeAsenaServerFromCode(rootFileCode);

    const asenaServerCodeBlock = RegexHelper.getAsenaServerCodeBlock(rootFileCode);

    if (!asenaServerCodeBlock) {
      throw new Error('No AsenaServer has found');
    }

    return { cleanedCode, asenaServerCodeBlock };
  }

  private async readAndPrepareCode() {
    const rootFileCode = await Bun.file(this.configFile.rootFile).text();

    await Bun.write(this._buildFilePath, RegexHelper.removeAsenaServerFromCode(rootFileCode));

    const controllers = await getControllers(this.configFile.rootFile, this.configFile.sourceFolder);

    if (!checkControllerExistence(controllers)) {
      console.error('\x1b[31m%s\x1b[0m', 'No components has found');

      fs.unlinkSync(path.normalize(this._buildFilePath));

      process.exit(1);
    }

    return { rootFileCode, injections: controllers };
  }

  private prepareImports(components: ControllerPath) {
    const imports: ImportsByFiles = {};

    let allComponents: string[] = [];

    for (const path of Object.keys(components)) {
      if (!imports[path]) {
        imports[path] = components[path].map((injection) => injection.name);
      } else {
        imports[path] = imports[path].concat(components[path].map((injection) => injection.name));
      }

      allComponents = allComponents.concat(imports[path]);
    }

    return { imports, allComponents };
  }

  private async executeBuild() {
    const buildResult = await this.buildWithBunAPI();

    if (!buildResult.success) {
      throw new Error(JSON.stringify(buildResult.logs));
    }
  }

  private buildWithBunAPI = async () => {
    const asenaFooter = `/*
 * ╔═══════════════════════════════════════╗
 * ║     ⚡ Built with Asena Framework      ║
 * ║   https://github.com/AsenaJs/Asena    ║
 * ╚═══════════════════════════════════════╝
 */`;

    const { plugin: htmlPlugin, htmlImports } = this.createHTMLPlugin();

    const defaultBuildConfig: BuildConfig = {
      entrypoints: [this._buildFilePath],
      outdir: './out',
      target: 'bun',
      footer: asenaFooter,
      plugins: [htmlPlugin],
    };

    const finalBuildConfig: BuildConfig = this.configFile.buildOptions
      ? {
          ...this.configFile.buildOptions,
          entrypoints: [this._buildFilePath],
          target: 'bun',
          footer: asenaFooter,
          plugins: [htmlPlugin],
        }
      : defaultBuildConfig;

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

  private createBuildFilePath(): string {
    return `${path.dirname(this.configFile.rootFile)}/${changeFileExtensionToAsenaJs(simplifyPath(this.configFile.rootFile))}`;
  }
}
