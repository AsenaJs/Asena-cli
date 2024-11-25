import { Command } from 'commander';
import { CreateHandler } from '../actions';

export const createCommand = new Command('create')
  .description('Creates an Asena project and installs the required dependencies.')
  .action(async () => {
    try {
      const createHandler = await new CreateHandler().init();

      await createHandler.create();
    } catch (error) {
      console.error('Build failed: ', error);
    }
  });
