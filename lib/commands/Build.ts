import fs from 'fs';
import path from 'path';
import { type BuildConfig, write } from 'bun';
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
      throw new Error(buildResult.logs.toString());
    }
  }

  private buildWithBunAPI = async () => {
    const asenaFooter = `/*
 * ╔═══════════════════════════════════════╗
 * ║     ⚡ Built with Asena Framework      ║
 * ║   https://github.com/AsenaJs/Asena    ║
 * ╚═══════════════════════════════════════╝
 */`;

    const defaultBuildConfig: BuildConfig = {
      entrypoints: [this._buildFilePath],
      outdir: './out',
      target: 'bun',
      footer: asenaFooter,
    };

    const finalBuildConfig: BuildConfig = this.configFile.buildOptions
      ? {
          ...this.configFile.buildOptions,
          entrypoints: [this._buildFilePath],
          target: 'bun',
          footer: asenaFooter,
        }
      : defaultBuildConfig;

    return await Bun.build(finalBuildConfig);
  };

  private createBuildFilePath(): string {
    return `${path.dirname(this.configFile.rootFile)}/${changeFileExtensionToAsenaJs(simplifyPath(this.configFile.rootFile))}`;
  }

}
