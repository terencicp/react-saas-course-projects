import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DetailSkeleton, ListSkeleton } from '@/components/skeletons';

// Render a skeleton component to its first-paint markup. Node env, no DOM:
// we assert on the server-rendered HTML the slot shows before data resolves.
const render = (Component: () => unknown) =>
  renderToStaticMarkup(createElement(Component as never));

// Each shadcn <Skeleton> primitive paints an animate-pulse block. Counting them
// tells us how many placeholder bars the skeleton draws, regardless of markup.
const countSkeletonBlocks = (html: string) =>
  (html.match(/animate-pulse/g) ?? []).length;

describe('List slot shows a six-row ListSkeleton placeholder', () => {
  it('renders the list-skeleton container so the loading slot is identifiable', () => {
    const html = render(ListSkeleton);
    expect(
      html,
      'ListSkeleton must render an element carrying data-testid="list-skeleton" — the loading slot the list streams under. Check src/components/skeletons.tsx.',
    ).toContain('data-testid="list-skeleton"');
  });

  it('draws six placeholder rows that mirror the invoice list', () => {
    const html = render(ListSkeleton);
    expect(
      countSkeletonBlocks(html),
      'ListSkeleton must draw exactly six <Skeleton> rows so the placeholder matches the six-item list. Found a different count — check the row loop in src/components/skeletons.tsx.',
    ).toBe(6);
  });
});

describe('Detail slot shows a DetailSkeleton that mirrors the invoice detail', () => {
  it('renders the detail-skeleton container so the loading slot is identifiable', () => {
    const html = render(DetailSkeleton);
    expect(
      html,
      'DetailSkeleton must render an element carrying data-testid="detail-skeleton" — the loading slot the detail streams under. Check src/components/skeletons.tsx.',
    ).toContain('data-testid="detail-skeleton"');
  });

  it('draws four placeholder blocks mirroring heading, subtitle, separator and body', () => {
    const html = render(DetailSkeleton);
    expect(
      countSkeletonBlocks(html),
      'DetailSkeleton must draw four <Skeleton> blocks (heading, subtitle, separator, body) so its shape mirrors InvoiceDetail and the swap does not shift layout. Check src/components/skeletons.tsx.',
    ).toBe(4);
  });
});
