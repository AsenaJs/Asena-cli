import {describe, expect, it, spyOn} from 'bun:test';
import {init} from '../../src/init';
import * as helpers from '../../src/helpers';

const isAsenaConfigExistsMock = spyOn(helpers, 'isAsenaConfigExists');

describe('asena-cli init test', async () => {
  it('should revert error if asena config already exists', () => {
    isAsenaConfigExistsMock.mockReturnValueOnce(true);

    expect(init()).rejects.toThrow('asena config already exists');
  });

  it('should revert error if asena config already exists', async () => {
    isAsenaConfigExistsMock.mockReturnValueOnce(false);

    const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    spyOn(Bun, 'write').mockResolvedValueOnce(10);

    await init();

    expect(Bun.write).toHaveBeenCalled();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '\x1b[32m%s\x1b[0m',
      'Config file created. Please check and update the values according to your project.',
    );
  });
});
