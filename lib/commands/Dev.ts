import { $ } from 'bun';
import { Command } from 'commander';
import { ConfigHandler } from '../codeBuilder';
import { changeFileExtensionToAsenaJs, simplifyPath } from '../helpers';
import { Build } from './Build';

export class Dev {
  public command() {
    return new Command('dev')
      .description('Builds the project and starts the output file in development mode.')
      .option('--start', 'starts app in dev mode')
      .description('developer options')
      .action(async (option) => {
        try {
          if (option.start) {
            await this.exec();
          } else {
            console.log('We only support start command for now');
          }
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  private async exec() {
    await new Build().build();

    const configHandler = await new ConfigHandler().exec();

    let buildFile = `.${changeFileExtensionToAsenaJs(simplifyPath(configHandler.rootFile))}`;

    process.chdir(configHandler.outdir);

    await $`bun run ${buildFile}`;
  }
}
