import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora, { type Ora } from 'ora';
import { AsenaServerHandler, ControllerHandler, ImportHandler, AsenaLoggerCreator } from '../codeBuilder';
import {
  ESLINT,
  ESLINT_IGNORE,
  ESLINT_INSTALLATIONS,
  PRETTIER,
  PRETTIER_INSTALLATIONS,
  TSCONFIG,
} from '../constants';
import {
  getRootImports,
  getAdapterPackage,
  getAdapterFunctionName,
  getControllerImports,
} from '../helpers';
import { ImportType } from '../types';
import { Init } from './Init';
import type { BaseCommand } from '../types/baseCommand';
import type { ProjectSetupOptions } from '../types/create';

export class Create implements BaseCommand {

  private preference: ProjectSetupOptions = {
    projectName: 'AsenaProject',
    adapter: 'hono',
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

          // If no argument provided or '.' provided, create in current folder
          const currentFolder = !arg || arg === '.';

          await this.create(currentFolder, spinner);

          console.log('\x1b[32m%s\x1b[0m', '\nAsena project created.');

          spinner.stop();
        } catch (error) {
          spinner.stop();

          console.error('Create failed: ', error);
        }
      });
  }

  private async create(currentFolder: boolean, spinner: Ora) {
    this.preference = await this.askQuestions(currentFolder);

    // If creating in current folder, set project name to "myApp"
    if (currentFolder) {
      this.preference.projectName = 'myApp';
    }

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

    await new Init().exec(this.preference.adapter);
  }

  private async createDefaultIndexFile(projectPath: string) {
    let rootFileCode = '';
    const rootFileImports = getRootImports(this.preference.adapter);

    if (this.preference.logger) {
      rootFileImports['logger/logger'] = ['logger'];
    }

    rootFileCode = new ImportHandler(rootFileCode, ImportType.IMPORT).importToCode(rootFileImports, ImportType.IMPORT);

    const adapterFunctionName = getAdapterFunctionName(this.preference.adapter);
    const loggerArg = this.preference.logger ? 'logger' : 'console';

    if (this.preference.adapter === 'hono') {
      // Hono: createHonoAdapter(logger) returns [adapter, logger]
      rootFileCode += `\nconst [honoAdapter, asenaLogger] = ${adapterFunctionName}(${loggerArg});\n`;
      rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer('honoAdapter', 'asenaLogger').asenaServer;
    } else {
      // Ergenecore: createErgenecoreAdapter({ logger }) returns adapter instance
      rootFileCode += `\nconst ergenecoreAdapter = ${adapterFunctionName}({ logger: ${loggerArg} });\n`;
      rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer('ergenecoreAdapter', loggerArg).asenaServer;
    }

    await Bun.write(projectPath + '/src/index.ts', rootFileCode);
  }

  private async createAsenaLogger(projectPath: string) {
    let loggerCode = AsenaLoggerCreator.createLogger();

    await $`mkdir -p ${path.normalize(projectPath + '/src/logger')}`.quiet();

    await Bun.write(projectPath + '/src/logger/logger.ts', loggerCode);
  }

  private async createDefaultController(projectPath: string) {
    let controllerCode = '';

    const controllerImports = getControllerImports(this.preference.adapter);

    controllerCode = new ImportHandler(controllerCode, ImportType.IMPORT).importToCode(
      controllerImports,
      ImportType.IMPORT,
    );

    controllerCode += new ControllerHandler('')
      .addController('AsenaController', null)
      .addGetRouterToController('AsenaController', '', 'helloAsena');

    await $`mkdir -p ${path.normalize(projectPath + '/src/controllers')}`.quiet();

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
    const adapterPackage = getAdapterPackage(this.preference.adapter);
    await $`bun add @asenajs/asena ${adapterPackage}`.quiet();

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

  private async askQuestions(currentFolder: boolean): Promise<ProjectSetupOptions> {
    const questions: any[] = [];

    // Only ask for project name if NOT creating in current folder
    if (!currentFolder) {
      questions.push({
        type: 'input',
        name: 'projectName',
        message: 'Enter your project name:',
        validate: (input: string) => (input ? true : 'Project name cannot be empty!'),
        default: 'AsenaProject',
      });
    }

    // Always ask these questions
    questions.push(
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
    );

    const answers: any = await inquirer.prompt(questions);

    return {
      projectName: answers.projectName || 'myApp', // Default to 'myApp' if not asked
      adapter: answers.adapter,
      logger: answers.logger,
      eslint: answers.eslint,
      prettier: answers.prettier,
    };
  }

}
