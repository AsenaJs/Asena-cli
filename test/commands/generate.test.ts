import { describe, expect, it } from 'bun:test';
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
