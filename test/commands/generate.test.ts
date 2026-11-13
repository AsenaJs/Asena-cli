import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Generate } from '../../lib/commands/Generate';

describe('Generate', () => {
  it('should register the exception-handler generator with the eh alias', () => {
    const generate = new Generate().command();
    const subcommand = generate.commands.find((command) => command.name() === 'exception-handler');

    expect(subcommand?.aliases()).toEqual(['eh']);
  });

  it('should keep every generator alias unique', () => {
    const aliases = new Generate().command().commands.flatMap((command) => command.aliases());

    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

// The generators read the project's tsconfig and asena-config.ts from the working directory.
describe('Generate output', () => {
  let projectDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'asena-generate-'));
    previousCwd = process.cwd();

    await Bun.write(join(projectDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'ESNext' } }));
    await Bun.write(
      join(projectDir, 'asena-config.ts'),
      "export default { sourceFolder: 'src', rootFile: 'src/index.ts' };\n",
    );

    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await rm(projectDir, { recursive: true, force: true });
  });

  it('generates a controller that imports only the decorator it uses', async () => {
    const generate = new Generate() as any;
    let captured = '';

    generate.askQuestions = async () => ({ elementName: 'user' });
    generate.generate = async (code: string) => {
      captured = code;
    };

    await generate.generateController();

    expect(captured).toContain("import { Controller } from '@asenajs/asena/decorators';\n");
    expect(captured).not.toContain('Get');
    expect(captured).not.toContain('Context');
  });

  it('writes every generated file with exactly one final newline', async () => {
    const generate = new Generate() as any;

    await generate.generate('export class Unterminated {}', 'controllers', 'Unterminated');
    await generate.generate('export class Terminated {}\n', 'controllers', 'Terminated');
    await generate.generate('export class Blank {}\n\n', 'controllers', 'Blank');

    expect(await Bun.file(join(projectDir, 'src/controllers/Unterminated.ts')).text()).toBe(
      'export class Unterminated {}\n',
    );
    expect(await Bun.file(join(projectDir, 'src/controllers/Terminated.ts')).text()).toBe(
      'export class Terminated {}\n',
    );
    expect(await Bun.file(join(projectDir, 'src/controllers/Blank.ts')).text()).toBe('export class Blank {}\n');
  });
});
