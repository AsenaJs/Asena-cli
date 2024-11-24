import inquirer from 'inquirer';
import type { ProjectSetupOptions } from '../types/create';

export class CreateCliHandler {

  public async askProjectName(): Promise<ProjectSetupOptions> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: '📁 Enter your project name:',
        validate: (input: string) => (input ? true : 'Project name cannot be empty!'),
        default: 'asenaProject',
      },
      {
        type: 'confirm',
        name: 'eslint',
        message: '🔧 Do you want to setup ESLint?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'prettier',
        message: '✨ Do you want to setup Prettier?',
        default: true,
      },
    ]);
  }

}
