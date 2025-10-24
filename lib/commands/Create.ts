import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora, { type Ora } from 'ora';
import { AsenaLoggerCreator, AsenaServerHandler, ControllerHandler, ImportHandler } from '../codeBuilder';
import {
  ESLINT_INSTALLATIONS,
  ESLINT_WITH_PRETTIER_INSTALLATIONS,
  PRETTIER,
  PRETTIER_IGNORE,
  PRETTIER_INSTALLATIONS,
  TSCONFIG,
} from '../constants';
import { getAdapterFunctionName, getAdapterPackage, getControllerImports, getRootImports } from '../helpers';
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
      .argument('[project-name]', 'Project name (use "." for current directory)')
      .option('--adapter <adapter>', 'Adapter to use (hono or ergenecore)')
      .option('--logger', 'Setup default asena logger')
      .option('--no-logger', 'Skip asena logger setup')
      .option('--eslint', 'Setup ESLint')
      .option('--no-eslint', 'Skip ESLint setup')
      .option('--prettier', 'Setup Prettier')
      .option('--no-prettier', 'Skip Prettier setup')
      .action(async (projectName, options) => {
        const spinner = ora('Creating asena project...');

        try {
          // If no argument provided or '.' provided, create in current folder
          const currentFolder = !projectName || projectName === '.';

          await this.create(currentFolder, spinner, options, projectName);

          console.log('\x1b[32m%s\x1b[0m', '\nAsena project created.');

          spinner.stop();
        } catch (error) {
          spinner.stop();

          console.error('Create failed: ', error);
        }
      });
  }

  private async create(currentFolder: boolean, spinner: Ora, options?: any, projectName?: string) {
    this.preference = await this.askQuestions(currentFolder, options, projectName);

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
    const loggerCode = AsenaLoggerCreator.createLogger();

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

  private getEslintConfig(): string {
    const usePrettier = this.preference.prettier;

    return `// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
${usePrettier ? "const eslintConfigPrettier = require('eslint-config-prettier');" : ''}

module.exports = tseslint.config(
  // ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
${usePrettier ? '\n  // Prettier config to disable conflicting rules\n  eslintConfigPrettier,\n' : ''}
  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      '*.mjs',
      'test/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      'eslint.config.cjs',
      '*.md',
    ],
  },

  // Base configuration
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs', '*.cjs'],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Custom rules
  {
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/method-signature-style': 'off',

      // Relax some strict TypeScript rules for decorator metadata
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',

      // Allow empty interfaces (common in TypeScript patterns)
      '@typescript-eslint/no-empty-interface': 'off',

      // Allow require() in specific cases (Bun compatibility)
      '@typescript-eslint/no-require-imports': 'off',

      // Disable rules that require strictNullChecks (tsconfig has strict: false)
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // Allow any in union types (common in adapter interfaces)
      '@typescript-eslint/no-redundant-type-constituents': 'off',

      // Allow index signatures (common in dynamic interfaces)
      '@typescript-eslint/consistent-indexed-object-style': 'off',

      // Allow async functions without await (common in interface implementations)
      '@typescript-eslint/require-await': 'off',

      // Allow flexible generic constructors
      '@typescript-eslint/consistent-generic-constructors': 'off',
    },
  },
);
`;
  }

  private async installAndCreateEslint() {
    // Install base ESLint packages
    const output = await $`bun add -D ${ESLINT_INSTALLATIONS}`.quiet();

    if (output.exitCode !== 0) return;

    // Install prettier integration if prettier is enabled
    if (this.preference.prettier) {
      await $`bun add -D ${ESLINT_WITH_PRETTIER_INSTALLATIONS}`.quiet();
    }

    // Generate and write dynamic config
    const eslintConfig = this.getEslintConfig();
    await Bun.write(process.cwd() + '/eslint.config.cjs', eslintConfig);

    return output.stderr.toString() === '';
  }

  private async installAndCreatePrettier() {
    const output = await $`bun add -D ${PRETTIER_INSTALLATIONS}`.quiet();

    await Bun.write(process.cwd() + '/.prettierrc.js', PRETTIER);

    await Bun.write(process.cwd() + '/.prettierignore', PRETTIER_IGNORE);

    return output.stderr.toString() === '';
  }

  private async createTsConfig() {
    await Bun.write(process.cwd() + '/tsconfig.json', TSCONFIG);
  }

  private async askQuestions(
    currentFolder: boolean,
    options?: any,
    projectName?: string,
  ): Promise<ProjectSetupOptions> {
    // Check if we have any CLI options (non-interactive mode)
    const hasCliOptions =
      options &&
      (options.adapter !== undefined ||
        options.logger !== undefined ||
        options.eslint !== undefined ||
        options.prettier !== undefined);

    // If CLI options provided, use them for non-interactive mode
    if (hasCliOptions) {
      // Validate adapter if provided
      if (options.adapter && !['hono', 'ergenecore'].includes(options.adapter)) {
        throw new Error(`Invalid adapter: ${options.adapter}. Use 'hono' or 'ergenecore'.`);
      }

      return {
        projectName: projectName || 'AsenaProject',
        adapter: options.adapter || 'hono',
        logger: options.logger !== undefined ? options.logger : true,
        eslint: options.eslint !== undefined ? options.eslint : true,
        prettier: options.prettier !== undefined ? options.prettier : true,
      };
    }

    // Interactive mode - use inquirer prompts
    const questions: any[] = [];

    // Only ask for project name if NOT creating in current folder AND no projectName provided
    if (!currentFolder && !projectName) {
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
      projectName: projectName || answers.projectName || 'myApp',
      adapter: answers.adapter,
      logger: answers.logger,
      eslint: answers.eslint,
      prettier: answers.prettier,
    };
  }
}
