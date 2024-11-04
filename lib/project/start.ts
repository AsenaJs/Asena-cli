import {readConfigFile} from '../config';
import {changeFileExtensionToAsenaJs, findBuildExecutable} from '../helpers';
import {$} from 'bun';

export const runProject = async () => {
  const config = readConfigFile();
  let buildDir = 'out';

  if (config.buildOptions?.outdir) {
    buildDir = config.buildOptions?.outdir;
  }

  const executeFile = findBuildExecutable(buildDir, changeFileExtensionToAsenaJs(config.rootFile));

  await $`bun run ${executeFile}`;
};
