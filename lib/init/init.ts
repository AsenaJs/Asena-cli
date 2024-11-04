import {isAsenaConfigExists} from '../helpers';
import {INITIAL_ASENA_CONFIG} from '../constants';

export const init = async () => {
  if (!isAsenaConfigExists()) {
    const numberOfBytes = await Bun.write('.asenarc.json', INITIAL_ASENA_CONFIG);

    if (numberOfBytes !== 0) {
      console.log(
        '\x1b[32m%s\x1b[0m',
        'Config file created. Please check and update the values according to your project.',
      );
    }
  } else {
    throw new Error('asena config already exists');
  }
};
