import path from 'node:path';
import { getAllFiles } from '../helpers';
import type { AsenaConfig, BuildOptions } from '../types';

export class ConfigHandler {
  private _configFile: AsenaConfig = { rootFile: '', sourceFolder: '' };

  public async exec() {
    this._configFile = await this.readConfigFile();

    return this;
  }

  public get configFile(): AsenaConfig {
    return this._configFile;
  }

  public get rootFile(): string {
    return this._configFile.rootFile;
  }

  public get buildOptions(): BuildOptions | undefined {
    return this._configFile.buildOptions;
  }

  public get sourceFolder(): string {
    return this._configFile.sourceFolder;
  }

  public get outdir() {
    return this._configFile.buildOptions?.outdir ? this._configFile.buildOptions?.outdir : './out';
  }

  private readConfigFile = async () => {
    const folderPath = path.normalize(path.join(process.cwd()));
    const files: string[] = getAllFiles(folderPath);
    let config: AsenaConfig | null = null;

    for (const file of files) {
      if (file.endsWith('asena-config.ts')) {
        try {
          config = (await import(file)).default as AsenaConfig;
        } catch (e) {
          console.error('Cannot read config file', e);

          throw new Error('AsenaConfig file cannot read.');
        }

        break;
      }
    }

    if (!config || !config.rootFile || !config.sourceFolder) {
      throw new Error('No config file detected or invalid format');
    }

    return config;
  };
}
