import type { DevtoolsSnapshot } from '../../lib/console/protocol';

export interface CatchRow {
  type: string;
  /** The type itself first, then its ancestors, `Object` left out. */
  chain: string[];
  httpException: boolean;
  /** `Component.method`. */
  handler: string;
}

export const catchRows = (snapshot: DevtoolsSnapshot): CatchRow[] =>
  snapshot.exceptionHandlers.flatMap((handler) =>
    handler.catches.flatMap((entry) =>
      entry.types === 'catch-all'
        ? []
        : entry.types.map((type) => ({
            type: type.name,
            chain: type.chain,
            httpException: type.httpException === true,
            handler: `${handler.component}.${entry.method}`,
          })),
    ),
  );

export const catchAllHandler = (snapshot: DevtoolsSnapshot): string | null => {
  for (const handler of snapshot.exceptionHandlers) {
    const entry = handler.catches.find((candidate) => candidate.types === 'catch-all');

    if (entry) return `${handler.component}.${entry.method}`;
  }

  return null;
};

export const notFoundHandler = (snapshot: DevtoolsSnapshot): string | null => {
  const handler = snapshot.exceptionHandlers.find((candidate) => candidate.notFound !== undefined);

  return handler?.notFound ? `${handler.component}.${handler.notFound}` : null;
};

export type Answer =
  | { kind: 'catch'; handler: string; type: string; via: 'identity' | 'brand' }
  | { kind: 'catch-all'; handler: string }
  | { kind: 'config-onError' }
  | { kind: 'adapter-default' };

export interface WhoCatches {
  /** Whether the name is a caught type or one of their ancestors, the only class names the snapshot knows. */
  known: boolean;
  /** The name's own chain, as far as the snapshot knows it; just the name when unknown. */
  chain: string[];
  /** The name stands for classes with different ancestors; the first chain is used. */
  ambiguous: boolean;
  answer: Answer;
}

/**
 * Resolves an error type name the way core's ExceptionRegistry resolves a thrown value: the first caught type
 * on its chain, then `@Catch(HttpException)` for a branded error when that found nothing narrower, then the
 * catch-all; past the registry, `@Config.onError`, then the adapter's default.
 */
export const whoCatches = (snapshot: DevtoolsSnapshot, name: string, branded = false): WhoCatches => {
  const rows = catchRows(snapshot);
  const byType = new Map<string, CatchRow>();

  for (const row of rows) if (!byType.has(row.type)) byType.set(row.type, row);

  const chains = new Map<string, string[]>();

  for (const row of rows) {
    const index = row.chain.indexOf(name);

    if (index >= 0) {
      const chain = row.chain.slice(index);

      chains.set(chain.join('>'), chain);
    }
  }

  const known = chains.size > 0;
  const chain = [...chains.values()][0] ?? [name];
  const identityType = chain.find((link) => byType.has(link));
  const identity = identityType === undefined ? undefined : byType.get(identityType);
  const brand = rows.find((row) => row.type === 'HttpException' && row.httpException);
  const carriesBrand = branded || chain.includes('HttpException') || byType.get(name)?.httpException === true;
  const broaderThanBrand = identity !== undefined && brand?.chain.slice(1).includes(identity.type) === true;
  const catchAll = catchAllHandler(snapshot);

  const answer: Answer =
    brand && carriesBrand && (!identity || broaderThanBrand)
      ? { kind: 'catch', handler: brand.handler, type: brand.type, via: 'brand' }
      : identity
        ? { kind: 'catch', handler: identity.handler, type: identity.type, via: 'identity' }
        : catchAll
          ? { kind: 'catch-all', handler: catchAll }
          : snapshot.config.hasOnError
            ? { kind: 'config-onError' }
            : { kind: 'adapter-default' };

  return { known, chain, ambiguous: chains.size > 1, answer };
};
