import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const changesetConfigPath = join(import.meta.dir, '../../.changeset/config.json');

describe('changeset config', () => {
  it('stops @changesets from loading Prettier', async () => {
    const config = await Bun.file(changesetConfigPath).json();

    expect(config.prettier).toBe(false);
  });
});
