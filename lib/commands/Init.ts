import { Command } from 'commander';
import { INITIAL_ASENA_CONFIG_JSON, INITIAL_ASENA_CONFIG_TS } from '../constants';
import { isAsenaConfigExists } from '../helpers';
import type { BaseCommand } from '../types/baseCommand';
import type { InitSetupOptions } from '../types/init';

export class Init implements BaseCommand {

  private configFileFormat: InitSetupOptions;

  public constructor(configFileFormat?: InitSetupOptions) {
    if (!configFileFormat) this.configFileFormat = { configType: 'JSON' };

    this.configFileFormat = configFileFormat as InitSetupOptions;
  }

  public command() {
    return new Command('init')
      .description('Creates a .asenarc.json file with default values (requires manual updates).')
      .option('-ts, --typescript', 'Make your config file format ts')
      .action(async (options: { typescript: boolean }) => {
        try {
          this.configFileFormat = { configType: options.typescript ? 'TypeScript' : 'JSON' };

          await this.exec();

          console.log(
            '\x1b[32m%s\x1b[0m',
            'Config file created. Please check and update the values according to your project.',
          );
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  public async exec() {
    if (!isAsenaConfigExists()) {
      const isJsonFormat = this.configFileFormat.configType === 'JSON';
      const configFileName = `.asenarc.${isJsonFormat ? 'json' : 'ts'}`;
      const configFile = isJsonFormat ? INITIAL_ASENA_CONFIG_JSON : INITIAL_ASENA_CONFIG_TS;

      const numberOfBytes = await Bun.write(configFileName, configFile);

      if (numberOfBytes === 0) {
        throw new Error('Failed to create asena config');
      }
    }
  }

}
