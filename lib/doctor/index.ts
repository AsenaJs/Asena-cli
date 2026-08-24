import type { CheckResult, DoctorCheck } from '../types';
import { ASENA_CONFIG_NAME, checkAsenaConfig } from './checks/asenaConfig';
import { DIRECT_DEPENDENCIES_NAME, checkDirectDependencies } from './checks/directDependencies';
import { DUPLICATE_PACKAGES_NAME, checkDuplicatePackages } from './checks/duplicatePackages';
import { PEER_RANGES_NAME, checkPeerRanges } from './checks/peerRanges';
import { TSCONFIG_DECORATORS_NAME, checkTsconfigDecorators } from './checks/tsConfigDecorators';

export { checkAsenaConfig, ASENA_CONFIG_NAME } from './checks/asenaConfig';
export { checkDirectDependencies, DIRECT_DEPENDENCIES_NAME } from './checks/directDependencies';
export { checkDuplicatePackages, DUPLICATE_PACKAGES_NAME } from './checks/duplicatePackages';
export { checkPeerRanges, PEER_RANGES_NAME } from './checks/peerRanges';
export { checkTsconfigDecorators, TSCONFIG_DECORATORS_NAME } from './checks/tsConfigDecorators';

/** Ordered list of the checks `asena doctor` runs. */
export const DOCTOR_CHECKS: { name: string; run: DoctorCheck }[] = [
  { name: TSCONFIG_DECORATORS_NAME, run: checkTsconfigDecorators },
  { name: ASENA_CONFIG_NAME, run: checkAsenaConfig },
  { name: DIRECT_DEPENDENCIES_NAME, run: checkDirectDependencies },
  { name: DUPLICATE_PACKAGES_NAME, run: checkDuplicatePackages },
  { name: PEER_RANGES_NAME, run: checkPeerRanges },
];

/** Runs every check against `cwd`. Checks report failures; they never throw. */
export const runDoctor = async (cwd: string): Promise<CheckResult[]> =>
  await Promise.all(
    DOCTOR_CHECKS.map(async ({ name, run }) => {
      try {
        return await run(cwd);
      } catch (e) {
        return { name, ok: false, detail: `check crashed: ${(e as Error).message}` };
      }
    }),
  );

/** Exit code contract: 1 when any check failed, 0 otherwise. */
export const exitCodeFor = (results: CheckResult[]): number => (results.some((result) => !result.ok) ? 1 : 0);
