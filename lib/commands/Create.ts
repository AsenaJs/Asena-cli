import fs from 'fs';
import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora, { type Ora } from 'ora';
import { AsenaServerHandler, ControllerHandler, ImportHandler, AsenaLoggerCreator } from '../codeBuilder';
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
    projectName: 'AsenaProject',
    logger: true,
    eslint: true,
    prettier: true,
  };

  public command() {
    return new Command('create')
      .description('Creates an Asena project and installs the required dependencies.')
      .action(async () => {
        const spinner = ora('Creating asena project...');

        try {
          const arg = process.argv.slice(3)[0];

          await this.create(arg === '.', spinner);

          console.log('\x1b[32m%s\x1b[0m', '\nAsena project created.');

          spinner.stop();
        } catch (error) {
          spinner.stop();

          console.error('Create failed: ', error);
        }
      });
  }

  private async create(currentFolder: boolean, spinner: Ora) {
    this.preference = await this.askQuestions();

    spinner.start();

    const projectPath = currentFolder ? process.cwd() : path.resolve(process.cwd(), this.preference.projectName);

    await this.createPackageJson(projectPath);

    await this.createDefaultController(projectPath);

    if (this.preference.logger) await this.createAsenaLogger(projectPath);

    await this.createDefaultIndexFile(projectPath);

    if (!currentFolder) process.chdir(projectPath);

    await this.installPreRequests();

    if (this.preference.eslint) await this.installAndCreateEslint();

    if (this.preference.prettier) await this.installAndCreatePrettier();

    await this.createTsConfig();

    await new Init().exec();
  }

  private async createDefaultIndexFile(projectPath: string) {
    let rootFileCode = '';
    const rootFileImports = ROOT_FILE_IMPORTS;

    if (this.preference.logger) {
      rootFileImports['logger/logger'] = ['logger'];
    }

    rootFileCode = new ImportHandler(rootFileCode, ImportType.IMPORT).importToCode(rootFileImports, ImportType.IMPORT);

    rootFileCode += `\nconst [honoAdapter,asenaLogger] = createHonoAdapter(${this.preference.logger ? 'logger' : 'console'});\n`;

    rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer('honoAdapter, asenaLogger').asenaServer;

    await Bun.write(projectPath + '/src/index.ts', rootFileCode);
  }

  private async createAsenaLogger(projectPath: string) {
    let loggerCode = AsenaLoggerCreator.createLogger();

    fs.mkdirSync(path.normalize(projectPath + '/src/logger'), { recursive: true });

    await Bun.write(projectPath + '/src/logger/logger.ts', loggerCode);
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

    fs.mkdirSync(path.normalize(projectPath + '/src/controllers'), { recursive: true });

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
    await $`bun add @asenajs/asena @asenajs/hono-adapter`.quiet();

    if (this.preference.logger) {
      await $`bun add @asenajs/asena-logger`.quiet();
    }

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

  private async askQuestions(): Promise<ProjectSetupOptions> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter your project name:',
        validate: (input: string) => (input ? true : 'Project name cannot be empty!'),
        default: 'AsenaProject',
      },
      {
        type: 'confirm',
        name: 'logger',
        message: 'Do you want to setup default asena logger?[Yes by default]',
        default: true,
      },
      {
        type: 'confirm',
        name: 'eslint',
        message: 'Do you want to setup ESLint?[Yes by default]',
        default: true,
      },
      {
        type: 'confirm',
        name: 'prettier',
        message: 'Do you want to setup Prettier?[Yes by default]',
        default: true,
      },
    ]);

    return {
      projectName: answers.projectName,
      logger: answers.logger,
      eslint: answers.eslint,
      prettier: answers.prettier,
    };
  }

}
