import path from 'node:path';
import stripJsonComments from 'strip-json-comments';
import type { CheckResult } from '../../types';

export const TSCONFIG_DECORATORS_NAME = 'tsconfig-decorators';

const FLAGS = ['experimentalDecorators', 'emitDecoratorMetadata'] as const;

export const checkTsconfigDecorators = async (cwd: string): Promise<CheckResult> => {
  const tsconfigPath = path.join(cwd, 'tsconfig.json');

  let raw: string;

  try {
    raw = await Bun.file(tsconfigPath).text();
  } catch {
    return {
      name: TSCONFIG_DECORATORS_NAME,
      ok: false,
      detail: 'tsconfig.json not found',
      hint: 'create a tsconfig.json with "experimentalDecorators": true and "emitDecoratorMetadata": true',
    };
  }

  let parsed: { compilerOptions?: Record<string, unknown> };

  try {
    parsed = JSON.parse(stripJsonComments(raw)) as { compilerOptions?: Record<string, unknown> };
  } catch (e) {
    return {
      name: TSCONFIG_DECORATORS_NAME,
      ok: false,
      detail: `tsconfig.json could not be parsed: ${(e as Error).message}`,
    };
  }

  const missing = FLAGS.filter((flag) => parsed.compilerOptions?.[flag] !== true);

  if (missing.length > 0) {
    return {
      name: TSCONFIG_DECORATORS_NAME,
      ok: false,
      detail: `missing or not true: ${missing.join(', ')}`,
      hint: `set "compilerOptions": { "experimentalDecorators": true, "emitDecoratorMetadata": true } in tsconfig.json`,
    };
  }

  return {
    name: TSCONFIG_DECORATORS_NAME,
    ok: true,
    detail: 'experimentalDecorators and emitDecoratorMetadata are enabled',
  };
};
