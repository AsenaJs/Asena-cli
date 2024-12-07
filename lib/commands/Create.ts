import fs from 'fs';
import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { AsenaServerHandler, ControllerHandler, ImportHandler } from '../codeBuilder';
import {
  CONTROLLER_IMPORTS,
  ESLINT,
  ESLINT_IGNORE,
  ESLINT_INSTALLATIONS,
  PRETTIER,
  PRETTIER_INSTALLATIONS,
  ROOT_FILE_IMPORTS,
  TSCONFIG,
} from '../constants';
import { ImportType } from '../types';
import { Init } from './Init';
import type { BaseCommand } from '../types/baseCommand';
import type { ProjectSetupOptions } from '../types/create';

export class Create implements BaseCommand {

  private preference: ProjectSetupOptions = {
    config: { configType: 'JSON' },
    projectName: 'AsenaProject',
    eslint: true,
    prettier: true,
  };

  public command() {
    return new Command('create')
      .description('Creates an Asena project and installs the required dependencies.')
      .action(async () => {
        try {
          await this.create();
        } catch (error) {
          console.error('Create failed: ', error);
        }
      });
  }

  private async create() {
    this.preference = await this.createQuestions();

    const projectPath = path.resolve(process.cwd(), this.preference.projectName);

    await this.createPackageJson(projectPath);

    await this.createDefaultController(projectPath);

    await this.createDefaultIndexFile(projectPath);

    process.chdir(projectPath);

    await this.installPreRequests();

    if (this.preference.eslint) await this.installAndCreateEslint();

    if (this.preference.prettier) await this.installAndCreatePrettier();

    await this.createTsConfig();

    await new Init(this.preference.config).exec();
  }

  private async createDefaultIndexFile(projectPath: string) {
    let rootFileCode = '';

    rootFileCode = new ImportHandler(rootFileCode, ImportType.IMPORT).importToCode(
      ROOT_FILE_IMPORTS,
      ImportType.IMPORT,
    );

    rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer().addComponents(['AsenaController']);

    await Bun.write(projectPath + '/src/index.ts', rootFileCode);
  }

  private async createDefaultController(projectPath: string) {
    let controllerCode = '';

    controllerCode = new ImportHandler(controllerCode, ImportType.IMPORT).importToCode(
      CONTROLLER_IMPORTS,
      ImportType.IMPORT,
    );

    controllerCode += new ControllerHandler('')
      .addController('AsenaController', null)
      .addGetRouterToController('AsenaController', '', 'helloAsena');

    fs.mkdirSync(projectPath + '/src/controllers', { recursive: true });

    await Bun.write(projectPath + '/src/controllers/AsenaController.ts', controllerCode);
  }

  private async createPackageJson(projectPath: string) {
    const packageJsonFile = `{
      "name":"${this.preference.projectName}",
      "module":"src/index.ts",
      "type":"module"
    }`;

    await Bun.write(projectPath + '/package.json', packageJsonFile);
  }

  private async installPreRequests() {
    await $`bun add @asenajs/asena hono winston`.quiet();

    await $`bun add -D @types/bun typescript`.quiet();
  }

  private async installAndCreateEslint() {
    const output = await $`bun add -D ${ESLINT_INSTALLATIONS}`.quiet();

    if (output.exitCode !== 0) return;

    await Bun.write(process.cwd() + '/.eslintrc.js', ESLINT);

    await Bun.write(process.cwd() + '/.eslintignore', ESLINT_IGNORE);

    return output.stderr.toString() === '';
  }

  private async installAndCreatePrettier() {
    const output = await $`bun add -D ${PRETTIER_INSTALLATIONS}`.quiet();

    await Bun.write(process.cwd() + '/.prettierrc.js', PRETTIER);

    return output.stderr.toString() === '';
  }

  private async createTsConfig() {
    await Bun.write(process.cwd() + '/tsconfig.json', TSCONFIG);
  }

  private async createQuestions(): Promise<ProjectSetupOptions> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: '📁 Enter your project name:',
        validate: (input: string) => (input ? true : 'Project name cannot be empty!'),
        default: 'AsenaProject',
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
      {
        type: 'list',
        name: 'config',
        message: '📁 Choose the type of your config file:',
        choices: ['JSON', 'TypeScript'],
        default: 'JSON',
      },
    ]);

    return {
      projectName: answers.projectName,
      eslint: answers.eslint,
      prettier: answers.prettier,
      config: { configType: answers.config },
    };
  }

}
