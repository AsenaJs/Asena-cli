export const CONSOLE_MIN_CORE_VERSION = '0.13.0';

/** The core versions whose devtools agent this host was built against. */
export const CONSOLE_CORE_RANGE = '>=0.13.0-0 <0.14.0';

export const DEVTOOLS_SUBPATH = '@asenajs/asena/devtools';

/** The named export of `@asenajs/asena/devtools` the wrapper installs as the hook. */
export const DEVTOOLS_AGENT_EXPORT = 'attachDevtoolsAgent';

/** The absolute path of the project's devtools agent module, or null when its core does not ship one. */
export const resolveDevtoolsAgent = (root: string): string | null => {
  try {
    return Bun.resolveSync(DEVTOOLS_SUBPATH, root);
  } catch {
    return null;
  }
};

export const isSupportedCoreVersion = (version: string): boolean => {
  try {
    return Bun.semver.satisfies(version, CONSOLE_CORE_RANGE);
  } catch {
    return false;
  }
};
