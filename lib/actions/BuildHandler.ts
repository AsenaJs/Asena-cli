import fs from 'fs';
import path from 'path';
import { $, type BuildConfig, write } from 'bun';
import { AsenaServerHandler, ConfigHandler, ImportHandler } from '../codeHandler';
import { checkComponentExistence, getFileExtension, getImportType, RegexUtils } from '../helpers';
import { InjectionHandler } from '../ioc/InjectionHandler';
import type { ComponentsPath, ImportsByFiles } from '../types';

export class BuildHandler {

  private _buildFilePath = '';

  private configFile: ConfigHandler;

  public constructor() {
    this.configFile = new ConfigHandler();

    this._buildFilePath = this.createBuildFilePath();
  }

  public async build() {
    try {
      const { rootFileCode, injections } = await this.readAndPrepareCode();

      const buildCode = await this.buildCode(rootFileCode, injections);

      await write(this._buildFilePath, buildCode);

      await this.handleBuild();

      this.removeAsenaEntryFile();

      console.log('Build completed successfully.');
    } catch (e) {
      this.removeAsenaEntryFile();

      console.error('Build failed:', e);
    }
  }

  public removeBuildFolder() {
    try {
      fs.rmdirSync(this.configFile.outdir);
    } catch (err) {
      console.log('Can not find out dir');
    }
  }

  public removeAsenaEntryFile = () => {
    try {
      fs.unlinkSync(this._buildFilePath);
    } catch {
      console.log('No asena entry file has found');
    }
  };

  private async buildCode(rootFileCode: string, components: ComponentsPath) {
    const importType = await getImportType();

    const { cleanedCode, asenaServerCodeBlock } = this.cleanCodeAndExtractServer(rootFileCode);

    const importHandler = new ImportHandler(cleanedCode, importType);

    const { imports, allComponents } = this.prepareImports(components);

    const code = importHandler.importToCode(imports, importType);

    const asenaServer = new AsenaServerHandler(asenaServerCodeBlock).addComponents(allComponents);

    return code + asenaServer;
  }

  private cleanCodeAndExtractServer(rootFileCode: string) {
    const cleanedCode = RegexUtils.removeAsenaServerFromCode(rootFileCode);

    const asenaServerCodeBlock = RegexUtils.getAsenaServerCodeBlock(rootFileCode);

    if (!asenaServerCodeBlock) {
      throw new Error('No AsenaServer has found');
    }

    return { cleanedCode, asenaServerCodeBlock };
  }

  private createExecutable = async () => {
    const output = await $`bun build ${this._buildFilePath} --outfile ${this.configFile.outdir} --compile`;

    return output.stdout.toString();
  };

  private async readAndPrepareCode() {
    const rootFileCode = await Bun.file(this.configFile.rootFile).text();

    await Bun.write(this._buildFilePath, RegexUtils.removeAsenaServerFromCode(rootFileCode));

    const injections = (await new InjectionHandler().init()).injections;

    if (!checkComponentExistence(injections)) {
      console.error('\x1b[31m%s\x1b[0m', 'No components has found');

      fs.unlinkSync(this._buildFilePath);

      process.exit(1);
    }

    return { rootFileCode, injections };
  }

  private prepareImports(components: ComponentsPath) {
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

  private async handleBuild() {
    if (this.configFile.buildOptions?.executable) {
      await this.createExecutable();
    } else {
      const output = await this.runBuild();

      if (!output.success) {
        throw new Error(output.logs.toString());
      }
    }
  }

  private runBuild = async () => {
    if (this.configFile.buildOptions) {
      let buildOptions: BuildConfig = { ...this.configFile.buildOptions, entrypoints: [this._buildFilePath] };

      return await Bun.build(buildOptions);
    }

    return await Bun.build({
      entrypoints: [this._buildFilePath],
      outdir: './out',
      target: 'bun',
    });
  };

  private createBuildFilePath(): string {
    return `${path.dirname(this.configFile.rootFile)}/index.asena${getFileExtension(this.configFile.rootFile)}`;
  }

  public get buildFilePath() {
    return this._buildFilePath;
  }

}
