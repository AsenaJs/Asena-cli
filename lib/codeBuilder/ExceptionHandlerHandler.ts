export class ExceptionHandlerHandler {
  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addExceptionHandler(className: string) {
    const exceptionHandlerClass = `\n@ExceptionHandler()
export class ${className} {

  @Catch()
  public fallback(error: unknown, ctx: ExceptionContext<Context>) {
    if (ctx.scope !== 'http' || isHttpException(error)) return;

    console.error('Unhandled error:', error);

    return ctx.context.send({ error: 'Internal Server Error' }, 500);
  }

}`;

    this._code = this._code + exceptionHandlerClass;

    return this;
  }

  public get code() {
    return this._code;
  }
}
