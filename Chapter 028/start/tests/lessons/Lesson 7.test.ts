import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Hero } from '@/components/hero';

// Node-env harness: no DOM, so we assert the server-rendered (first-paint)
// markup of the hero — exactly what proves the no-FOUC promise, since both
// theme images must already be in the SSR output before any JS runs.
// Hero is a plain sync Server Component, so we invoke it as a function (the
// file is .ts, not .tsx) and render the element it returns.
const html = renderToStaticMarkup(Hero());

// The opening tag of an <img> by data-testid, or undefined if absent.
const imgTag = (testid: string) =>
  html.match(new RegExp(`<img\\b[^>]*data-testid="${testid}"[^>]*>`))?.[0];

// Read one attribute's value off a single tag's markup.
const attr = (tag: string | undefined, name: string) =>
  tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// Every anchor href in the rendered hero, in document order.
const anchorHrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(
  (m) => m[1],
);

describe('Lesson 7 — Hero with a flicker-free theme-aware image', () => {
  // Requirement 1: one <h1>, supporting copy, two CTAs that navigate.
  describe('renders one heading, supporting copy, and two navigating CTAs', () => {
    it('renders exactly one <h1>', () => {
      const headings = [...html.matchAll(/<h1\b/g)].length;
      expect(
        headings,
        `The hero owns the page's single <h1>; found ${headings}. Render exactly one <h1> in hero.tsx so the heading hierarchy never skips a level.`,
      ).toBe(1);
    });

    it('renders supporting copy beneath the heading', () => {
      const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
      expect(
        paragraph.trim().length,
        'The hero needs supporting copy under the heading. Add a <p> with the marketing sentence between the <h1> and the CTAs.',
      ).toBeGreaterThan(0);
    });

    it('renders two CTA buttons that each navigate to a destination', () => {
      expect(
        anchorHrefs.length,
        `The hero should have two CTA buttons that navigate, found ${anchorHrefs.length} link(s). Use <Button asChild size="lg"> wrapping a <Link href="..."> for each CTA.`,
      ).toBe(2);

      for (const href of anchorHrefs) {
        expect(
          href,
          'A CTA link has an empty href. Each CTA must point somewhere — pass an href to its <Link>.',
        ).not.toBe('');
      }
    });
  });

  // Requirement 2: the marketing image shown matches the active theme, via two
  // SSR <img> siblings the .dark class picks between — never a JS branch.
  describe('ships both theme images so the active one paints first frame', () => {
    it('emits the light and dark <img> sources side by side in SSR output', () => {
      expect(
        imgTag('hero-image-light'),
        'The light hero image is missing from the server markup. ThemeAwareImage must render a real <img data-testid="hero-image-light"> so it is present on first paint.',
      ).toBeTruthy();
      expect(
        imgTag('hero-image-dark'),
        'The dark hero image is missing from the server markup. ThemeAwareImage must render a real <img data-testid="hero-image-dark"> as a sibling of the light one.',
      ).toBeTruthy();
    });

    it('points the two sources at different image files', () => {
      const lightSrc = attr(imgTag('hero-image-light'), 'src');
      const darkSrc = attr(imgTag('hero-image-dark'), 'src');
      expect(
        lightSrc,
        'The light <img> needs a src. Pass the light asset path to ThemeAwareImage and render it as the light image source.',
      ).toBeTruthy();
      expect(
        darkSrc,
        'The dark <img> needs a src. Pass the dark asset path to ThemeAwareImage and render it as the dark image source.',
      ).toBeTruthy();
      expect(
        lightSrc,
        'Both theme images resolve to the same file. The light and dark sources must differ so the swap shows a different image per theme.',
      ).not.toBe(darkSrc);
    });

    it('keeps the light image visible by default and the dark image hidden by default', () => {
      const lightClass = attr(imgTag('hero-image-light'), 'class') ?? '';
      const darkClass = attr(imgTag('hero-image-dark'), 'class') ?? '';

      // The light image must paint with no .dark class on <html> — visible at
      // base, hidden only once .dark flips on.
      expect(
        lightClass,
        'The light image must be visible by default. Give it "block dark:hidden" so it shows until the .dark class turns it off.',
      ).toMatch(/\bblock\b/);
      expect(
        lightClass,
        'The light image must hide once the dark theme is active. Add the "dark:hidden" variant alongside "block".',
      ).toMatch(/\bdark:hidden\b/);

      // The dark image is the mirror: hidden at base, shown only under .dark.
      expect(
        darkClass,
        'The dark image must be hidden by default. Give it "hidden dark:block" so it stays out until the .dark class turns it on.',
      ).toMatch(/\bhidden\b/);
      expect(
        darkClass,
        'The dark image must appear only under the dark theme. Add the "dark:block" variant alongside "hidden".',
      ).toMatch(/\bdark:block\b/);
    });

    it('shares alt, width, and height across both sources to reserve layout', () => {
      const light = imgTag('hero-image-light');
      const dark = imgTag('hero-image-dark');

      for (const name of ['alt', 'width', 'height']) {
        const lightValue = attr(light, name);
        const darkValue = attr(dark, name);
        expect(
          lightValue,
          `The light image is missing "${name}". Pass alt/width/height to ThemeAwareImage so the box is reserved and the image is described.`,
        ).toBeTruthy();
        expect(
          darkValue,
          `The dark image is missing "${name}". Both sources must share the same alt/width/height.`,
        ).toBeTruthy();
        expect(
          lightValue,
          `The two sources disagree on "${name}". Render both <img> tags from the same alt/width/height so the swap causes no layout shift.`,
        ).toBe(darkValue);
      }
    });
  });
});
