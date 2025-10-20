export class WebSocketHandler {

  private _code: string;

  public constructor(code: string) {
    this._code = code;
  }

  public addWebSocketNamespace(className: string, path: string) {
    const websocketClass = `
@WebSocket({ path: '${path}', name: '${className}' })
export class ${className} extends AsenaWebSocketService {

  protected async onOpen(ws: Socket): Promise<void> {
    console.log('Client connected');
  }

  protected async onMessage(ws: Socket, message: string): Promise<void> {
    console.log('Message received:', message);
  }

  protected async onClose(ws: Socket): Promise<void> {
    console.log('Client disconnected');
  }

}`;

    this._code = this._code + websocketClass;

    return this;
  }

  public get code() {
    return this._code;
  }

}