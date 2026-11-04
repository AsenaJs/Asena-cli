import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../../console-ui/App';

describe('console UI shell', () => {
  test('renders the header and an empty main area', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('<h1 class="shell-title">Asena Console</h1>');
    expect(html).toContain('<main class="shell-main"></main>');
  });
});
