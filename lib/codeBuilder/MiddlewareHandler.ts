import { RegexHelper } from '../helpers';

export class MiddlewareHandler {
  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addMiddleware(serviceName: string) {
    const service = `\n@Middleware()\nexport class ${serviceName} extends MiddlewareService{\n\n}`;

    this._code = this._code + service;

    return this;
  }

  public addDefaultHandle(serviceName: string) {
    const handle = `\n\n\tpublic handle(context:Context, next:Function) {\n\t\tcontext.setValue("testValue","test");\n\n\t\tnext();\n\t}`;

    const controllerEndIndex = RegexHelper.getElementIndexByName(this._code, 'Middleware', serviceName);

    if (!controllerEndIndex) throw new Error('Controller is not exists');

    this._code =
      this._code.substring(0, controllerEndIndex - 2) + handle + this._code.substring(controllerEndIndex - 2);

    return this;
  }

  public get code() {
    return this._code;
  }
}
