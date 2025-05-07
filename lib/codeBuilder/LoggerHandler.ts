export class LoggerHandler {

  private _logger = '';

  public createDefaultLogger() {
    this._logger = `import {AsenaLogger} from "@asenajs/asena-logger"; \n\nexport const logger = new AsenaLogger();`;

    return this;
  }

  public get logger() {
    return this._logger;
  }

}
