import { RegexHelper } from '../helpers';

export class MiddlewareHandler {
  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addMiddleware(serviceName: string) {
    const service = `\n@Middleware()\nexport class ${serviceName} extends MiddlewareService {\n\n}`;

    this._code = this._code + service;

    return this;
  }

  public addDefaultHandle(serviceName: string) {
    // `next: Function` and a synchronous body used to be generated here, but that does not
    // type-check against Ergenecore's MiddlewareService - the scaffold must compile as-is.
    const handle = `\n\n  public async handle(context: Context, next: () => Promise<void>) {\n    context.setValue('testValue', 'test');\n    await next();\n  }`;

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
