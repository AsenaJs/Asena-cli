export class ServerConfigHandler {
  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addConfigClass(className: string) {
    const configClass = `
@Config()
export class ${className} extends ConfigService {

  public onError(error: Error, context: Context): Response | Promise<Response> {
    console.error('Error:', error.message);

    return context.send({ error: error.message }, 500);
  }

}`;

    this._code = this._code + configClass;

    return this;
  }

  public get code() {
    return this._code;
  }
}
