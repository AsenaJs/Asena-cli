export class AsenaLoggerCreator {
  public static createLogger() {
    return `import {AsenaLogger} from "@asenajs/asena-logger"; \n\nexport const logger = new AsenaLogger();`;
  }
}
