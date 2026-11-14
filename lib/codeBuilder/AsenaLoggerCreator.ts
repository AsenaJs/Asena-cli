export class AsenaLoggerCreator {
  public static createLogger() {
    return `import { AsenaLogger } from '@asenajs/asena-logger';

export const logger = new AsenaLogger();
`;
  }
}
