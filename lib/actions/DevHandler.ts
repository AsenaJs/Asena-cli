import { $ } from 'bun';
import { ConfigHandler } from '../codeHandler';
import { changeFileExtensionToAsenaJs, simplifyPath } from '../helpers';
import { BuildHandler } from './BuildHandler';

export class DevHandler {

  public async buildAndRun() {
    await new BuildHandler().build();

    const configHandler = new ConfigHandler();

    let buildFile = `.${changeFileExtensionToAsenaJs(simplifyPath(configHandler.rootFile))}`;

    process.chdir(configHandler.outdir);

    await $`bun run ${buildFile}`;
  }

}
