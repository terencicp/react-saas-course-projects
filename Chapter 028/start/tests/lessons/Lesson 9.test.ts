import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PricingCard } from '@/components/pricing-card';
import { PricingTable } from '@/components/pricing-table';
import { pricingTiers } from '@/lib/data';

// Node-env harness: no DOM, so we assert the server-rendered (first-paint)
// markup the table produces. PricingTable / PricingCard are sync Server
// Components, so we invoke them as functions (the file is .ts, not .tsx) and
// render the element they return.
const tableHtml = renderToStaticMarkup(PricingTable());

// The full markup of each pricing card <article> (featured or not) in document
// order, balanced by walking from each opening tag to its matching </article>.
const cardMarkup = (html: string) => {
  const cards: string[] = [];
  const open = /<article\b[^>]*data-testid="pricing-card(?:-featured)?"[^>]*>/g;
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

// The data-testid of the outer <article> tag in one card's markup.
const cardTestid = (card: string) =>
  card.match(/<article\b[^>]*\sdata-testid="([^"]*)"/)?.[1] ?? '';

// Render a single PricingCard in isolation so we can probe how one tier's
// `featured` flag drives its own look, independent of the table layout.
const renderCard = (props: Parameters<typeof PricingCard>[0]) =>
  renderToStaticMarkup(PricingCard(props));

const baseTier = {
  name: 'Probe',
  price: '$7',
  period: 'month' as const,
  features: ['Probe feature'],
  cta: { label: 'Probe CTA', href: '#probe' },
};

describe('Lesson 9 — Pricing table with a featured tier', () => {
  // Requirement 1: one card per data entry, each showing name, price, period,
  // every feature, and the CTA.
  describe('renders one data-driven card per tier, with name/price/period/features/CTA', () => {
    const cards = cardMarkup(tableHtml);

    it('renders exactly one card per entry in pricingTiers', () => {
      expect(
        cards.length,
        `The table should render one pricing-card <article> per entry in pricingTiers (expected ${pricingTiers.length}, found ${cards.length}). Map over pricingTiers in pricing-table.tsx instead of hardcoding cards.`,
      ).toBe(pricingTiers.length);
    });

    it("shows each tier's name, price and billing period", () => {
      for (const tier of pricingTiers) {
        expect(
          tableHtml,
          `The "${tier.name}" card is missing its tier name. Render each tier's name inside its card.`,
        ).toContain(tier.name);
        expect(
          tableHtml,
          `The "${tier.name}" card is missing its price (${tier.price}). Render each tier's price inside its card.`,
        ).toContain(tier.price);
        expect(
          tableHtml,
          `The "${tier.name}" card is missing its billing period ("${tier.period}"). Render each tier's period next to the price.`,
        ).toContain(tier.period);
      }
    });

    it('lists every feature for each tier', () => {
      for (const tier of pricingTiers) {
        for (const feature of tier.features) {
          expect(
            tableHtml,
            `The "${tier.name}" card is missing the feature "${feature}". Map over each tier's features[] into a list inside its card.`,
          ).toContain(feature);
        }
      }
    });

    it("renders each tier's CTA as a link to its href", () => {
      for (const tier of pricingTiers) {
        expect(
          tableHtml,
          `The "${tier.name}" card is missing its CTA label ("${tier.cta.label}"). Render each tier's cta.label as the button text.`,
        ).toContain(tier.cta.label);
        expect(
          tableHtml,
          `The "${tier.name}" CTA does not link to its href ("${tier.cta.href}"). Render the CTA as a link to cta.href.`,
        ).toContain(`href="${tier.cta.href}"`);
      }
    });
  });

  // Requirement 2: the data-flagged tier is visually distinct (accent ring +
  // "Most popular" badge) and no other tier is. Emphasis is declarative — the
  // single `featured` flag drives the look, nothing is hand-placed per tier.
  describe('promotes exactly the data-flagged tier with an accent ring and a "Most popular" badge', () => {
    const cards = cardMarkup(tableHtml);
    const flaggedCount = pricingTiers.filter((tier) => tier.featured).length;

    it('marks exactly the featured tiers as featured, no more, no fewer', () => {
      const featuredCards = cards.filter(
        (card) => cardTestid(card) === 'pricing-card-featured',
      );
      expect(
        featuredCards.length,
        `Exactly ${flaggedCount} card(s) should render as featured (data-testid="pricing-card-featured"), but ${featuredCards.length} did. Drive the featured branch off each tier's \`featured\` flag so promotion follows the data.`,
      ).toBe(flaggedCount);
    });

    it('shows the "Most popular" badge only on the featured tier', () => {
      cards.forEach((card) => {
        const isFeatured = cardTestid(card) === 'pricing-card-featured';
        const hasBadge = card.includes('Most popular');
        expect(
          hasBadge,
          isFeatured
            ? `The featured card is missing its "Most popular" badge. Render the badge only inside the featured branch.`
            : `A non-featured card is showing the "Most popular" badge. The badge must appear only when \`featured\` is set, not on every tier.`,
        ).toBe(isFeatured);
      });
    });

    it('adds the accent ring only on the featured tier', () => {
      cards.forEach((card) => {
        const isFeatured = cardTestid(card) === 'pricing-card-featured';
        const hasRing = /\bring-primary\b/.test(cardClass(card));
        expect(
          hasRing,
          isFeatured
            ? `The featured card has no accent ring. Add the primary ring (ring-primary) only in the featured branch.`
            : `A non-featured card has the accent ring. The ring must come from the \`featured\` flag, not be hand-placed on a tier.`,
        ).toBe(isFeatured);
      });
    });

    it('toggles the badge and ring purely from the featured flag', () => {
      // Same tier data, only the flag flips: the accent and badge must follow
      // the flag, proving emphasis is data-driven rather than per-tier markup.
      const plain = renderCard({ ...baseTier, featured: false });
      const promoted = renderCard({ ...baseTier, featured: true });

      expect(
        plain.includes('Most popular') || /\bring-primary\b/.test(plain),
        `An unflagged tier rendered the badge or accent ring. With \`featured\` off, a card must read as a plain tier.`,
      ).toBe(false);
      expect(
        promoted.includes('Most popular'),
        `Flagging a tier \`featured\` did not add the "Most popular" badge. The same card must promote itself when the flag flips.`,
      ).toBe(true);
      expect(
        /\bring-primary\b/.test(cardClass(cardMarkup(promoted)[0] ?? '')),
        `Flagging a tier \`featured\` did not add the accent ring. The same card must gain the ring when the flag flips.`,
      ).toBe(true);
    });
  });

  // Requirement 3: the featured tier's scale lift is suppressed for users who
  // prefer reduced motion — the lift is gated behind motion-reduce: and is
  // owned by the table (passed through className), not hard-coded on the card.
  describe('suppresses the featured scale lift under reduced motion', () => {
    const cards = cardMarkup(tableHtml);

    it('applies the desktop scale lift only to the featured tier', () => {
      cards.forEach((card) => {
        const isFeatured = cardTestid(card) === 'pricing-card-featured';
        const hasLift = /\bmd:scale-105\b/.test(cardClass(card));
        expect(
          hasLift,
          isFeatured
            ? `The featured card never receives the desktop scale lift (md:scale-105). The table should pass the lift to the featured tier through className.`
            : `A non-featured card received the scale lift. Only the featured tier should be lifted.`,
        ).toBe(isFeatured);
      });
    });

    it('pairs the lift with a reduced-motion override that zeroes the scale', () => {
      const featuredCard = cards.find(
        (card) => cardTestid(card) === 'pricing-card-featured',
      );
      expect(
        featuredCard,
        `No featured card was rendered, so the reduced-motion lift could not be checked. Render the featured tier first (see requirement 2).`,
      ).toBeDefined();

      const cls = cardClass(featuredCard ?? '');
      expect(
        /\bmd:motion-reduce:scale-100\b/.test(cls),
        `The featured card's lift (md:scale-105) is not paired with a reduced-motion override (md:motion-reduce:scale-100), so reduced-motion users still get the animated lift. Gate the lift behind motion-reduce: so it flattens to scale-100.`,
      ).toBe(true);
    });

    it('does not bake the lift into the card itself', () => {
      // A card with no className passed in must carry no lift: the responsive /
      // motion concern belongs to the table (the layout owner), keeping the
      // card a pure presentation of one tier.
      const card = renderCard({ ...baseTier, featured: true });
      const cls = cardClass(cardMarkup(card)[0] ?? '');
      expect(
        /\bscale-105\b/.test(cls),
        `The scale lift is hard-coded inside the card. Let the table own the lift by passing it through className, so the card stays a pure tier view.`,
      ).toBe(false);
    });
  });
});
