import { Command } from 'commander';
import { BuildHandler } from '../actions';

export const buildCommand = new Command('build')
  .description('For building the project and preparing it for production deployment.')
  .action(async () => {
    try {
      await new BuildHandler().build();
    } catch (error) {
      console.error('Build failed: ', error);
    }
  });
