import { $ } from 'bun';
import { Command } from 'commander';
import { Build } from './Build';
import type { BaseCommand } from '../types/baseCommand';

export class Dev implements BaseCommand {
  public command() {
    const devCommand = new Command('dev').description('Developer options');

    devCommand
      .command('start')
      .description('Builds the project and starts the output file.')
      .action(async () => {
        try {
          await this.exec();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });

    return devCommand;
  }

  private async exec() {
    const buildFile = await new Build().build();

    await $`bun run ${buildFile}`;
  }
}
