import type { AsenaConfig } from './asenaConfig';

/**
 * Result of a single `asena doctor` check.
 *
 * A check that cannot run at all (missing file, unparsable JSON) reports
 * `ok: false` with a `detail` explaining why — it never throws.
 */
export interface CheckResult {
  /** Stable check identifier, e.g. `tsconfig-decorators`. */
  name: string;
  ok: boolean;
  /** Human-readable outcome; for failures it states what is wrong. */
  detail: string;
  /** Optional fix suggestion, printed indented under a failing check. */
  hint?: string;
}

/** A doctor check: a pure async function of the project directory. */
export type DoctorCheck = (cwd: string) => Promise<CheckResult>;

/** The imported `asena-config.ts` default export, as the doctor inspects it. */
export type DoctorAsenaConfig = AsenaConfig;
