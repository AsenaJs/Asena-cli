export class LoggerHandler {

  private _logger = '';

  public createDefaultLogger() {
    this._logger = `import {DefaultLogger} from "@asenajs/asena/logger"; \n\nexport const logger = new DefaultLogger();`;

    return this;
  }

  public get logger() {
    return this._logger;
  }

}
