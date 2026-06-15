import type { LucideIcon } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FeatureCard } from '@/components/feature-card';
import { FeatureGrid } from '@/components/feature-grid';
import { features } from '@/lib/data';

// Node-env harness: no DOM, so we assert the server-rendered (first-paint)
// markup the grid produces. FeatureGrid / FeatureCard are sync Server
// Components, so we invoke them as functions (the file is .ts, not .tsx) and
// render the element they return.
const gridHtml = renderToStaticMarkup(FeatureGrid());

// The full markup of each <article data-testid="feature-card"> in document
// order, balanced by walking from each opening tag to its matching </article>.
const cardMarkup = (html: string) => {
  const cards: string[] = [];
  const open = /<article\b[^>]*data-testid="feature-card"[^>]*>/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex walk
  while ((match = open.exec(html)) !== null) {
    const start = match.index;
    const close = html.indexOf('</article>', open.lastIndex);
    cards.push(html.slice(start, close === -1 ? undefined : close));
  }
  return cards;
};

// The class attribute of the outer <article> tag in one card's markup.
const cardClass = (card: string) =>
  card.match(/<article\b[^>]*\sclass="([^"]*)"/)?.[1] ?? '';

// The class signature each tone is expected to contribute, beyond the base
// surface. `default` adds nothing of its own. These mirror the variant table
// the lesson asks the student to author.
const TONE_SIGNATURE: Record<string, RegExp> = {
  brand: /bg-primary\/5/,
  muted: /bg-muted/,
};

// The class signature `emphasis: 'loud'` is expected to contribute. `quiet`
// adds nothing.
const LOUD_SIGNATURE = /shadow-md/;

describe('Lesson 8 — Feature grid with CVA card variants', () => {
  // Requirement 1: one card per data entry, each showing icon, title, copy.
  describe('renders one data-driven card per feature, with icon/title/copy', () => {
    const cards = cardMarkup(gridHtml);

    it('renders exactly one card per entry in features', () => {
      expect(
        cards.length,
        `The grid should render one <article data-testid="feature-card"> per entry in features (expected ${features.length}, found ${cards.length}). Map over features in feature-grid.tsx instead of hardcoding cards.`,
      ).toBe(features.length);
    });

    it("shows each feature's title and description text", () => {
      for (const feature of features) {
        expect(
          gridHtml,
          `The card for "${feature.title}" is missing its title text. Render each feature's title (a CardTitle) inside its card.`,
        ).toContain(feature.title);
        expect(
          gridHtml,
          `The card for "${feature.title}" is missing its description text. Render each feature's description (a CardDescription) inside its card.`,
        ).toContain(feature.description);
      }
    });

    it('renders an icon (an <svg>) inside every card', () => {
      const withIcon = cards.filter((card) => /<svg\b/.test(card)).length;
      expect(
        withIcon,
        `Every card should render its data-provided LucideIcon (the \`icon\` prop) as an <svg>; ${withIcon} of ${features.length} cards have one. Render the Icon inside each card.`,
      ).toBe(features.length);
    });
  });

  // Requirement 2: per-card tone/emphasis reflect the data, and the variant
  // table enumerates only real states — an unknown value produces no card that
  // doesn't exist (no foreign tone classes leak in).
  describe("applies each card's tone and emphasis from the data, with no invalid state expressible", () => {
    const cards = cardMarkup(gridHtml);

    it('recolors each card to match its data-driven tone', () => {
      features.forEach((feature, index) => {
        const cls = cardClass(cards[index] ?? '');
        const signature = TONE_SIGNATURE[feature.tone ?? 'default'];
        if (!signature) return; // `default` contributes no tone-specific class

        expect(
          signature.test(cls),
          `The "${feature.title}" card has tone "${feature.tone}" in the data but its rendered classes don't reflect it. Wire tone straight through to featureCardVariants so the data picks the look.`,
        ).toBe(true);
      });
    });

    it('lifts each card according to its data-driven emphasis', () => {
      features.forEach((feature, index) => {
        const cls = cardClass(cards[index] ?? '');
        const isLoud = (feature.emphasis ?? 'quiet') === 'loud';

        expect(
          LOUD_SIGNATURE.test(cls),
          `The "${feature.title}" card emphasis is "${feature.emphasis}" but the rendered lift (shadow-md) ${isLoud ? 'is missing' : 'leaked onto a quiet card'}. Drive emphasis through featureCardVariants so only "loud" cards lift.`,
        ).toBe(isLoud);
      });
    });

    it('enumerates only real tones — an unknown tone yields no foreign tone classes', () => {
      // The variant table maps a closed set of tones; a value outside it (a
      // typo, in practice caught by the type) must not silently render as some
      // other tone. cva drops unknown keys, so no tone signature should appear.
      const html = renderToStaticMarkup(
        FeatureCard({
          title: 'Probe',
          description: 'Probe',
          icon: (() => null) as unknown as LucideIcon,
          // Cast past the closed union to simulate an invalid value.
          tone: 'does-not-exist' as unknown as 'default',
          emphasis: 'quiet',
        }),
      );
      const cls = cardClass(cardMarkup(html)[0] ?? '');

      for (const [tone, signature] of Object.entries(TONE_SIGNATURE)) {
        expect(
          signature.test(cls),
          `An unknown tone rendered as the "${tone}" tone. The cva variant table must enumerate only the real tones so an invalid value can't produce a card that looks like a different, valid one.`,
        ).toBe(false);
      }
    });
  });
});
