import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DevtoolsSnapshot } from '../../../lib/console/protocol';
import { ConfigPanel } from '../../../console-ui/config/ConfigPanel';
import { isSecretKey, valueRows, valueState } from '../../../console-ui/config/values';
import snapshotJson from '../fixtures/snapshot.json';

const snapshot = snapshotJson as unknown as DevtoolsSnapshot;
const hello = {
  coreVersion: '0.13.0',
  adapter: 'Ergenecore',
  port: 3000,
  pid: 7,
  transports: [{ name: 'default', connected: true }],
};

const withValues = (values: DevtoolsSnapshot['components'][number]['values']): DevtoolsSnapshot => ({
  ...snapshot,
  components: snapshot.components.map((component) =>
    component.name === 'ItemService' ? { ...component, values } : component,
  ),
});

describe('config values', () => {
  test('one row per @Value field, with its component', () => {
    expect(valueRows(snapshot)).toEqual([
      {
        component: 'ItemService',
        componentType: 'SERVICE',
        field: 'pageSize',
        key: 'DEVTOOLS_FIXTURE_PAGE_SIZE',
        hasDefault: true,
        parsed: true,
        isSet: false,
        secret: false,
      },
      {
        component: 'ItemService',
        componentType: 'SERVICE',
        field: 'region',
        key: 'DEVTOOLS_FIXTURE_REGION',
        hasDefault: false,
        parsed: false,
        isSet: true,
        secret: false,
      },
    ]);
  });

  test('flags keys that read like credentials', () => {
    for (const key of [
      'JWT_SECRET',
      'DB_PASSWORD',
      'DB_PASSWD',
      'GITHUB_TOKEN',
      'STRIPE_API_KEY',
      'APIKEY',
      'SENTRY_DSN',
    ]) {
      expect(isSecretKey(key)).toBe(true);
    }

    for (const key of ['PORT', 'PAGE_SIZE', 'REGION', 'LOG_LEVEL', 'DEVTOOLS_FIXTURE_REGION']) {
      expect(isSecretKey(key)).toBe(false);
    }
  });

  test('a variable is set, falls back to its default, or is missing', () => {
    expect(valueState({ isSet: true, hasDefault: false })).toBe('set');
    expect(valueState({ isSet: false, hasDefault: true })).toBe('default');
    expect(valueState({ isSet: false, hasDefault: false })).toBe('missing');
  });
});

describe('config panel rendering', () => {
  const panel = (props: Partial<Parameters<typeof ConfigPanel>[0]> = {}) =>
    renderToStaticMarkup(<ConfigPanel snapshot={snapshot} hello={hello} metrics={[]} {...props} />);

  test('lists the @Value fields without a value, the config, global middleware, server and transports', () => {
    const html = panel();

    expect(html).toContain('DEVTOOLS_FIXTURE_PAGE_SIZE');
    expect(html).toContain('unset, default used');
    expect(html).toContain('<td><span>set</span></td>');
    expect(html).toContain('Values are never sent to the console');
    expect(html).toContain('AppConfig');
    expect(html).toContain('CorsHeaders');
    expect(html).toContain('every route, except /health');
    expect(html).toContain('Ergenecore');
    expect(html).toContain('connected');
    expect(html).not.toContain('secret-looking');
    expect(html.match(/<div class="card-head">/g)).toHaveLength(5);
  });

  test('a secret-looking key is tagged and a variable with no default and no value is called out', () => {
    const html = panel({
      snapshot: withValues([{ field: 'apiKey', key: 'ITEMS_API_KEY', hasDefault: false, parsed: false, isSet: false }]),
    });

    expect(html).toContain('secret-looking');
    expect(html).toContain('<span class="pill warn">unset, no default</span>');
  });

  test('says when there is nothing to list', () => {
    const html = panel({
      snapshot: {
        ...withValues([]),
        config: { hasOnError: true, hasOnNotFound: false, globalMiddlewares: [] },
      },
      hello: { ...hello, transports: [] },
    });

    expect(html).toContain('The app declares no @Value field.');
    expect(html).toContain('none declared');
    expect(html).toContain('answers when no @Catch matches');
    expect(html).toContain('No global middleware.');
    expect(html).toContain('The app configures no microservice transport.');
  });
});
