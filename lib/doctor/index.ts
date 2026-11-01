import type { CheckResult, DoctorCheck } from '../types';
import { ASENA_CONFIG_NAME, checkAsenaConfig } from './checks/asenaConfig';
import { AUTH_BETTER_AUTH_DEP_NAME, checkAuthBetterAuthDep } from './checks/authBetterAuthDep';
import { AUTH_COOKIE_NAME, checkAuthCookie } from './checks/authCookie';
import { AUTH_ENFORCEMENT_NAME, checkAuthEnforcement } from './checks/authEnforcement';
import { DIRECT_DEPENDENCIES_NAME, checkDirectDependencies } from './checks/directDependencies';
import { DUPLICATE_PACKAGES_NAME, checkDuplicatePackages } from './checks/duplicatePackages';
import { PEER_RANGES_NAME, checkPeerRanges } from './checks/peerRanges';
import { TSCONFIG_DECORATORS_NAME, checkTsconfigDecorators } from './checks/tsConfigDecorators';

export { checkAsenaConfig, ASENA_CONFIG_NAME } from './checks/asenaConfig';
export { checkAuthBetterAuthDep, AUTH_BETTER_AUTH_DEP_NAME } from './checks/authBetterAuthDep';
export { checkAuthCookie, AUTH_COOKIE_NAME } from './checks/authCookie';
export { checkAuthEnforcement, AUTH_ENFORCEMENT_NAME } from './checks/authEnforcement';
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
  { name: AUTH_ENFORCEMENT_NAME, run: checkAuthEnforcement },
  { name: AUTH_BETTER_AUTH_DEP_NAME, run: checkAuthBetterAuthDep },
  { name: AUTH_COOKIE_NAME, run: checkAuthCookie },
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
