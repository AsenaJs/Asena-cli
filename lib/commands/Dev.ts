import { $ } from 'bun';
import { Command } from 'commander';
import { ConfigHandler } from '../codeBuilder';
import { changeFileExtensionToAsenaJs, simplifyPath } from '../helpers';
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
    await new Build().build();

    const configHandler = await new ConfigHandler().exec();

    const buildFile = `${configHandler.outdir}/${changeFileExtensionToAsenaJs(simplifyPath(configHandler.rootFile))}`;

    await $`bun run ${buildFile}`;
  }

}
