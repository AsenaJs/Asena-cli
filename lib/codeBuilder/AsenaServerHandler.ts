import { RegexHelper } from '../helpers';

export class AsenaServerHandler {

  private _asenaServer: string;

  public constructor(asenaServer: string) {
    this._asenaServer = asenaServer;
  }

  public createEmptyAsenaServer() {
    this._asenaServer = `\n\nnew AsenaServer().logger(new DefaultLogger()).port(3000).start();`;

    return this;
  }

  public addComponents(components: string[]) {
    const endIndex = RegexHelper.getAsenaServerOffset(this._asenaServer);

    if (!endIndex) throw Error('No AsenaServer has found');

    const componentsString = components.join(',');

    this._asenaServer = `${this._asenaServer.substring(0, endIndex)}.components([${componentsString}])${this._asenaServer.substring(endIndex)}`;

    return this._asenaServer;
  }

  public get asenaServer() {
    return this._asenaServer;
  }

}
