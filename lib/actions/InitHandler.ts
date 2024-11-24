import { INITIAL_ASENA_CONFIG } from '../constants';
import { isAsenaConfigExists } from '../helpers';

export class InitHandler {

  public async init() {
    if (!isAsenaConfigExists()) {
      const numberOfBytes = await Bun.write('.asenarc.json', INITIAL_ASENA_CONFIG);

      if (numberOfBytes === 0) {
        throw new Error('Failed to create asena config');
      }
    }
  }

}
