import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionHead } from '../../../console-ui/ui/components';

describe('SectionHead', () => {
  test('renders the title and the count', () => {
    expect(renderToStaticMarkup(<SectionHead title="Transports" count={2} />)).toBe(
      '<div class="card-head"><h2 class="section-title">Transports</h2><span class="muted num">2</span></div>',
    );
  });

  test('renders a zero count and leaves out a missing one', () => {
    expect(renderToStaticMarkup(<SectionHead title="Events" count={0} />)).toContain(
      '<span class="muted num">0</span>',
    );
    expect(renderToStaticMarkup(<SectionHead title="Server" />)).toBe(
      '<div class="card-head"><h2 class="section-title">Server</h2></div>',
    );
  });
});
