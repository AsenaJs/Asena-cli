import { RegexHelper } from '../helpers';

export class MiddlewareHandler {
  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addMiddleware(serviceName: string) {
    const service = `\n@Middleware()\nexport class ${serviceName} extends MiddlewareService {}\n`;

    this._code = this._code + service;

    return this;
  }

  public addDefaultHandle(serviceName: string) {
    // `next: Function` and a synchronous body used to be generated here, but that does not
    // type-check against Ergenecore's MiddlewareService - the scaffold must compile as-is.
    const handle = `  public async handle(context: Context, next: () => Promise<void>) {\n    context.setValue('testValue', 'test');\n    await next();\n  }`;

    const classEndIndex = RegexHelper.getElementIndexByName(this._code, 'Middleware', serviceName);

    if (!classEndIndex) throw new Error('Controller is not exists');

    const head = this._code.substring(0, classEndIndex).trimEnd();

    this._code = `${head}\n${handle}\n${this._code.substring(classEndIndex)}`;

    return this;
  }

  public get code() {
    return this._code;
  }
}
