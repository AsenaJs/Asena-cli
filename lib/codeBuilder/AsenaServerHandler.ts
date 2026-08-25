export class AsenaServerHandler {
  private _asenaServer: string;

  public constructor(asenaServer: string) {
    this._asenaServer = asenaServer;
  }

  /**
   * Creates an empty AsenaServer initialization using the new Factory API
   * @param adapterVar - The adapter variable name (e.g., 'honoAdapter')
   * @param loggerVar - The logger variable name (e.g., 'asenaLogger')
   * @param port - The port number (default: 3000)
   */
  public createEmptyAsenaServer(adapterVar: string, loggerVar: string, port = 3000) {
    this._asenaServer = `
const server = await AsenaServerFactory.create({
  adapter: ${adapterVar},
  logger: ${loggerVar},
  port: ${port}
});

await server.start();`;

    return this;
  }

  public get asenaServer() {
    return this._asenaServer;
  }
}
