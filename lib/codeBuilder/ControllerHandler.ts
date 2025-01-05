import { RegexHelper } from '../helpers';

export class ControllerHandler {

  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addController(controllerName: string, controllerPath: string | null) {
    const controller = `\n@Controller(${controllerPath ? controllerPath : ''})\n export class ${controllerName}{\n\n}`;

    this._code = this._code + controller;

    return this;
  }

  public addGetRouterToController(controllerName: string, path: string, name: string) {
    const controller = `\n\n\t@Get('/${path}')\n\tpublic async ${name}(context:Context){\n\t\treturn context.send("Hello asena");\n\t}`;

    const controllerEndIndex = RegexHelper.getElementIndexByName(this._code,"Controller", controllerName);

    if (!controllerEndIndex) throw new Error('Controller is not exists');

    this._code =
      this._code.substring(0, controllerEndIndex - 2) + controller + this._code.substring(controllerEndIndex - 2);

    return this._code;
  }

  public get code() {
    return this._code;
  }

}
