import { describe, expect, it } from 'bun:test';
import { Create } from '../../lib/commands/Create';

describe('Create command CLI arguments', () => {
  it('should have correct command description', () => {
    const create = new Create();
    const command = create.command();

    expect(command).toBeDefined();

    expect(command.description()).toContain('Creates an Asena project');
  });

  it('should accept project-name argument', () => {
    const create = new Create();
    const command = create.command();

    const args = command.registeredArguments;

    expect(args).toBeDefined();

    expect(args.length).toBeGreaterThan(0);

    const projectNameArg = args.find((arg) => arg.name() === 'project-name');

    expect(projectNameArg).toBeDefined();

    expect(projectNameArg?.required).toBe(false); // Optional argument
  });

  it('should have adapter option', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const adapterOption = options.find((opt) => opt.long === '--adapter');

    expect(adapterOption).toBeDefined();

    expect(adapterOption?.description).toContain('Adapter to use');
  });

  it('should have logger options', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const loggerOption = options.find((opt) => opt.long === '--logger');
    const noLoggerOption = options.find((opt) => opt.long === '--no-logger');

    expect(loggerOption).toBeDefined();

    expect(noLoggerOption).toBeDefined();
  });

  it('should have eslint options', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const eslintOption = options.find((opt) => opt.long === '--eslint');
    const noEslintOption = options.find((opt) => opt.long === '--no-eslint');

    expect(eslintOption).toBeDefined();

    expect(noEslintOption).toBeDefined();
  });

  it('should have prettier options', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const prettierOption = options.find((opt) => opt.long === '--prettier');
    const noPrettierOption = options.find((opt) => opt.long === '--no-prettier');

    expect(prettierOption).toBeDefined();

    expect(noPrettierOption).toBeDefined();
  });

  it('should parse all required options correctly', () => {
    const create = new Create();
    const command = create.command();

    const expectedOptions = [
      '--adapter',
      '--logger',
      '--no-logger',
      '--eslint',
      '--no-eslint',
      '--prettier',
      '--no-prettier',
    ];

    const commandOptions = command.options.map((opt) => opt.long);

    for (const expectedOpt of expectedOptions) {
      expect(commandOptions).toContain(expectedOpt);
    }
  });
});
