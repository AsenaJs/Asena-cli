import { RegexHelper } from '../helpers';

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

  /**
   * Adds components array to the AsenaServerFactory.create() options object
   * Replaces existing components field if present
   * @param components - Array of component class names
   */
  public addComponents(components: string[]) {
    const createCallMatch = RegexHelper.getAsenaServerFactoryCreateBlock(this._asenaServer);

    if (!createCallMatch) throw Error('No AsenaServerFactory.create() call found');

    // Remove existing components field if present
    this._asenaServer = RegexHelper.removeComponentsFromOptions(this._asenaServer);

    const componentsString = components.join(', ');

    // Find the closing brace of the options object
    const optionsEndIndex = RegexHelper.getAsenaServerFactoryOptionsEnd(this._asenaServer);

    if (!optionsEndIndex) throw Error('Could not find options object end');

    // Insert components array before the closing brace
    // Check if we need to add a comma after the last property
    const beforeClosing = this._asenaServer.substring(0, optionsEndIndex).trimEnd();
    const needsComma = !beforeClosing.endsWith(',');

    this._asenaServer = `${beforeClosing}${needsComma ? ',' : ''}
  components: [${componentsString}]
${this._asenaServer.substring(optionsEndIndex)}`;

    return this._asenaServer;
  }

  public get asenaServer() {
    return this._asenaServer;
  }

}
