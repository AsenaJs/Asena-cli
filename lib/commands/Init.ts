import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { INITIAL_ASENA_CONFIG_TS } from '../constants';
import { getAsenaCliVersion, isAsenaConfigExists, writeAdapterConfig } from '../helpers';
import type { AdapterType } from '../types';
import type { BaseCommand } from '../types/baseCommand';

export class Init implements BaseCommand {
  public command() {
    return new Command('init')
      .description('Creates a asena-config.ts file with default values (requires manual updates).')
      .action(async () => {
        try {
          await this.exec();

          console.log(
            '\x1b[32m%s\x1b[0m',
            '\nConfig file created. Please check and update the values according to your project.',
          );
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  public async exec(adapter?: AdapterType) {
    if (!isAsenaConfigExists()) {
      // 1. Use provided adapter or ask user which adapter to use
      const selectedAdapter = adapter || (await this.askAdapterQuestion()).adapter;

      // 2. Create .asena/config.json with selected adapter and default suffix settings
      await writeAdapterConfig({
        adapter: selectedAdapter,
        suffixes: true, // Default: use standard suffixes (Controller, Service, etc.)
      });

      // 3. Install CLI package if needed
      if (!(await getAsenaCliVersion())) {
        const asenaCliVersion = await $`asena --version`.quiet().text();

        await $`bun add -D @asenajs/asena-cli@${asenaCliVersion}`.quiet();
      }

      // 4. Create asena-config.ts
      const numberOfBytes = await Bun.write('asena-config.ts', INITIAL_ASENA_CONFIG_TS);

      if (numberOfBytes === 0) {
        throw new Error('Failed to create asena config');
      }
    } else {
      console.log('\x1b[31m%s\x1b[0m', 'Config file already exists');
    }
  }

  private async askAdapterQuestion(): Promise<{ adapter: AdapterType }> {
    return inquirer.prompt([
      {
        type: 'list',
        name: 'adapter',
        message: 'Which adapter do you want to use?',
        choices: [
          { name: 'Hono Adapter (Recommended)', value: 'hono' },
          { name: 'Ergenecore Adapter', value: 'ergenecore' },
        ],
        default: 'hono',
      },
    ]);
  }
}
