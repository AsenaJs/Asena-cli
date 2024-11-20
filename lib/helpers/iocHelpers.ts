import type { ComponentsPath } from '../types';

export const checkComponentExistence = (injections: ComponentsPath) => {
  return Object.values(injections).some((paths) => paths.length > 0);
};
