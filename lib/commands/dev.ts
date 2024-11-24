import { Command } from 'commander';
import { DevHandler } from '../actions';

export const devCommand = new Command('dev')
  .description('Builds the project and starts the output file in development mode.')
  .option('--start', 'starts app in dev mode')
  .description('developer options')
  .action(async (option) => {
    try {
      if (option.start) {
        await new DevHandler().buildAndRun();
      } else {
        console.log('We only support start command for now');
      }
    } catch (error) {
      console.error('Build failed: ', error);
    }
  });
