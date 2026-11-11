import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DevtoolsExceptionHandler, DevtoolsSnapshot } from '../../../lib/console/protocol';
import { catchAllHandler, catchRows, notFoundHandler, whoCatches } from '../../../console-ui/exceptions/catches';
import { ExceptionsPanel } from '../../../console-ui/exceptions/ExceptionsPanel';
import snapshotJson from '../fixtures/snapshot.json';

const snapshot = snapshotJson as unknown as DevtoolsSnapshot;
const hello = { serverId: 'server-1', coreVersion: '0.13.0', adapter: 'Ergenecore', port: 3000, pid: 7 };

const withHandlers = (exceptionHandlers: DevtoolsExceptionHandler[], hasOnError = false): DevtoolsSnapshot => ({
  ...snapshot,
  exceptionHandlers,
  config: { ...snapshot.config, hasOnError },
});

const httpException = { name: 'HttpException', chain: ['HttpException', 'Error'], httpException: true as const };

// Both a @Catch(Error) and a @Catch(HttpException): the brand must win over Error, never over a narrower type.
const branded = withHandlers([
  {
    component: 'Errors',
    catches: [
      { method: 'http', types: [httpException] },
      { method: 'any', types: [{ name: 'Error', chain: ['Error'] }] },
      {
        method: 'conflict',
        types: [
          {
            name: 'ItemConflict',
            chain: ['ItemConflict', 'ConflictException', 'HttpException', 'Error'],
            httpException: true,
          },
        ],
      },
    ],
  },
]);

describe('exception handler map', () => {
  test('one row per caught type with its chain and handler; the catch-all and @NotFound apart', () => {
    expect(catchRows(snapshot)).toEqual([
      {
        type: 'ItemConflict',
        chain: ['ItemConflict', 'ConflictException', 'HttpException', 'Error'],
        httpException: true,
        handler: 'ApiExceptionHandler.conflict',
      },
      {
        type: 'ItemMissing',
        chain: ['ItemMissing', 'ItemError', 'Error'],
        httpException: false,
        handler: 'ApiExceptionHandler.known',
      },
      {
        type: 'ItemRejected',
        chain: ['ItemRejected', 'ItemError', 'Error'],
        httpException: false,
        handler: 'ApiExceptionHandler.known',
      },
    ]);
    expect(catchAllHandler(snapshot)).toBe('ApiExceptionHandler.fallback');
    expect(notFoundHandler(snapshot)).toBe('ApiExceptionHandler.missingRoute');
    expect(catchAllHandler(withHandlers([]))).toBeNull();
    expect(notFoundHandler(withHandlers([]))).toBeNull();
  });
});

describe('who catches this', () => {
  test('a caught type answers with its own handler', () => {
    expect(whoCatches(snapshot, 'ItemMissing')).toEqual({
      known: true,
      chain: ['ItemMissing', 'ItemError', 'Error'],
      ambiguous: false,
      answer: { kind: 'catch', handler: 'ApiExceptionHandler.known', type: 'ItemMissing', via: 'identity' },
    });
  });

  test('an ancestor the app knows but does not catch walks up to the catch-all', () => {
    expect(whoCatches(snapshot, 'ItemError')).toMatchObject({
      known: true,
      chain: ['ItemError', 'Error'],
      answer: { kind: 'catch-all', handler: 'ApiExceptionHandler.fallback' },
    });
    expect(whoCatches(snapshot, 'ConflictException').chain).toEqual(['ConflictException', 'HttpException', 'Error']);
  });

  test('a name the app does not know says so, and falls through to what answers an unrelated error', () => {
    expect(whoCatches(snapshot, 'PaymentDeclined')).toEqual({
      known: false,
      chain: ['PaymentDeclined'],
      ambiguous: false,
      answer: { kind: 'catch-all', handler: 'ApiExceptionHandler.fallback' },
    });
    expect(whoCatches(withHandlers([], true), 'PaymentDeclined').answer).toEqual({ kind: 'config-onError' });
    expect(whoCatches(withHandlers([]), 'PaymentDeclined').answer).toEqual({ kind: 'adapter-default' });
  });

  test('identity beats the brand when it finds something narrower than HttpException', () => {
    expect(whoCatches(branded, 'ItemConflict').answer).toMatchObject({ handler: 'Errors.conflict', via: 'identity' });
    expect(whoCatches(branded, 'ConflictException').answer).toMatchObject({ handler: 'Errors.http', via: 'identity' });
  });

  test('the brand beats a @Catch broader than HttpException, and reaches an error from another class tree', () => {
    expect(whoCatches(branded, 'Error', true).answer).toMatchObject({ handler: 'Errors.http', via: 'brand' });
    expect(whoCatches(branded, 'Error').answer).toMatchObject({ handler: 'Errors.any', via: 'identity' });
    expect(whoCatches(branded, 'HTTPException', true).answer).toMatchObject({ handler: 'Errors.http', via: 'brand' });
    expect(whoCatches(branded, 'HTTPException').answer).toEqual({ kind: 'adapter-default' });
  });

  test('two classes of one name with different ancestors are flagged', () => {
    const twice = withHandlers([
      {
        component: 'Errors',
        catches: [
          { method: 'a', types: [{ name: 'Timeout', chain: ['Timeout', 'NetError', 'Error'] }] },
          { method: 'b', types: [{ name: 'DbTimeout', chain: ['DbTimeout', 'NetError', 'DbError', 'Error'] }] },
        ],
      },
    ]);

    expect(whoCatches(twice, 'NetError').ambiguous).toBe(true);
    expect(whoCatches(twice, 'Timeout').ambiguous).toBe(false);
  });
});

describe('exceptions panel rendering', () => {
  test('maps every type to its handler, with the catch-all, @NotFound and the deprecated fallbacks', () => {
    const html = renderToStaticMarkup(<ExceptionsPanel snapshot={snapshot} hello={hello} />);

    expect(html).toContain('<td class="mono muted chain-cell">ConflictException → HttpException → Error</td>');
    expect(html).toContain('HttpException brand');
    expect(html).toContain('ApiExceptionHandler.known');
    expect(html).toContain('anything else');
    expect(html).toContain('ApiExceptionHandler.fallback');
    expect(html).toContain('ApiExceptionHandler.missingRoute');
    expect(html).toContain('Ergenecore&#x27;s default 404');
    expect(html.match(/not defined/g)).toHaveLength(2);
    expect(html).toContain('Type a class name');
    expect(html.match(/<div class="card-head">/g)).toHaveLength(3);
  });

  test('a query walks the chain and names the handler, or says the name is unknown', () => {
    const known = renderToStaticMarkup(
      <ExceptionsPanel snapshot={snapshot} hello={hello} initialQuery="ItemRejected" />,
    );
    const unknown = renderToStaticMarkup(
      <ExceptionsPanel snapshot={snapshot} hello={hello} initialQuery="PaymentDeclined" />,
    );

    expect(known).toContain('<li class="hit"><span class="step">ItemRejected</span></li>');
    expect(known).toContain('ApiExceptionHandler.known, the @Catch(ItemRejected) nearest on its class chain.');
    expect(unknown).toContain('The app knows no class named PaymentDeclined');
    expect(unknown).toContain('ApiExceptionHandler.fallback, the catch-all');
  });

  test('says when the app declares no @Catch at all', () => {
    const html = renderToStaticMarkup(<ExceptionsPanel snapshot={withHandlers([])} hello={null} />);

    expect(html).toContain('The app declares no @Catch handler.');
    expect(html).toContain('not declared');
  });
});
