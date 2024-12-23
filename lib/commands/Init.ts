import { $ } from 'bun';
import { Command } from 'commander';
import { INITIAL_ASENA_CONFIG_TS } from '../constants';
import { getAsenaCliVersion, isAsenaConfigExists } from '../helpers';
import type { BaseCommand } from '../types/baseCommand';

export class Init implements BaseCommand {

  public command() {
    return new Command('init')
      .description('Creates a asena-config.ts file with default values (requires manual updates).')
      .action(async () => {
        try {
          await this.exec();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  public async exec() {
    if (!isAsenaConfigExists()) {
      if (!(await getAsenaCliVersion())) {
        const asenaCliVersion = await $`asena --version`.quiet().text();

        await $`bun add -D @asenajs/asena-cli@${asenaCliVersion}`.quiet();
      }

      const numberOfBytes = await Bun.write('asena-config.ts', INITIAL_ASENA_CONFIG_TS);

      if (numberOfBytes === 0) {
        throw new Error('Failed to create asena config');
      }

      console.log(
        '\x1b[32m%s\x1b[0m',
        'Config file created. Please check and update the values according to your project.',
      );
    } else {
      console.log('\x1b[31m%s\x1b[0m', 'Config file already exists');
    }
  }

}
