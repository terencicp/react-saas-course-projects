import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SiteHeader } from '@/components/site-header';
import { navLinks } from '@/lib/data';

// Node-env harness: no DOM, so we assert the server-rendered (first-paint)
// markup of the header. `next/link` renders to a plain <a href>, the desktop
// <nav> and mobile slot keep their responsive classes, and the closed mobile
// drawer's labels live in a portal that is absent from this static markup —
// which is exactly what lets us check the "no duplication" rule.
// SiteHeader is a plain sync Server Component, so we invoke it as a function
// (the file is .ts, not .tsx) and render the element it returns.
const html = renderToStaticMarkup(SiteHeader());

// Slice of the markup inside the single <header> element.
const headerInner = (() => {
  const start = html.indexOf('<header');
  const end = html.lastIndexOf('</header>');
  return start === -1 || end === -1 ? '' : html.slice(start, end);
})();

// Slice of the markup inside the labelled desktop <nav>.
const navInner = (() => {
  const start = html.indexOf('<nav');
  const end = html.indexOf('</nav>');
  return start === -1 || end === -1 ? '' : html.slice(start, end);
})();

// Index of every anchor href occurrence, in document order.
const orderedHrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(
  (m) => m[1],
);

describe('Lesson 6 — Site header with desktop navigation', () => {
  // Requirement 1: logo + every primary nav link, in data-file order.
  describe('renders the logo and every primary nav link in order', () => {
    it('renders a home-pointing logo link', () => {
      expect(
        orderedHrefs,
        'The header should include a logo link to "/" (the home route). Render an <a>/<Link> with href="/" — e.g. the "Acme" wordmark.',
      ).toContain('/');
    });

    it('renders one nav anchor per entry in navLinks, with matching label and href', () => {
      for (const link of navLinks) {
        const anchor = new RegExp(
          `<a\\b[^>]*\\shref="${link.href.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}"[^>]*>${link.label}</a>`,
        );
        expect(
          navInner,
          `The desktop <nav> should contain a link "${link.label}" pointing to "${link.href}". Map over navLinks from src/lib/data.ts instead of hand-writing the anchors.`,
        ).toMatch(anchor);
      }
    });

    it('orders the nav links the same way they appear in src/lib/data.ts', () => {
      const navHrefs = [...navInner.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(
        (m) => m[1],
      );
      expect(
        navHrefs,
        'The nav links render out of order. Render them by mapping navLinks directly so document order tracks the data file.',
      ).toEqual(navLinks.map((link) => link.href));
    });
  });

  // Requirement 2: the responsive cut — desktop nav hidden below md, mobile
  // slot shown only below md.
  describe('hides the desktop nav and reveals the mobile slot below md', () => {
    it('marks the desktop nav as hidden until the md breakpoint', () => {
      const navTag = html.slice(
        html.indexOf('<nav'),
        html.indexOf('>', html.indexOf('<nav')) + 1,
      );
      expect(
        navTag,
        'The desktop <nav> should be hidden on small screens and shown from md up. Add the "hidden md:flex" responsive utilities to the <nav>.',
      ).toMatch(/\bhidden\b/);
      expect(navTag).toMatch(/\bmd:flex\b/);
    });

    it('keeps the mobile slot hidden from md up so it only fills small screens', () => {
      const mobileSlot = html.match(
        /<div\b[^>]*data-testid="header-mobile-slot"[^>]*>/,
      )?.[0];
      expect(
        mobileSlot,
        'The header should keep a mobile slot (data-testid="header-mobile-slot") where the links sit below md.',
      ).toBeTruthy();
      expect(
        mobileSlot,
        'The mobile slot should be visible only below md. Add the "md:hidden" utility so it is the inverse of the desktop nav.',
      ).toMatch(/\bmd:hidden\b/);
    });
  });

  // Requirement 3: one <header> landmark, one labelled <nav>, no duplicated
  // link text across the desktop and mobile surfaces.
  describe('is one labelled header landmark with no duplicated nav-link text', () => {
    it('renders exactly one <header> landmark', () => {
      const headers = [...html.matchAll(/<header\b/g)].length;
      expect(
        headers,
        `Expected a single <header> landmark, found ${headers}. The site header should be one semantic <header>.`,
      ).toBe(1);
    });

    it('renders exactly one <nav> and gives it an accessible name', () => {
      const navs = [...html.matchAll(/<nav\b/g)].length;
      expect(
        navs,
        `Expected exactly one <nav> in the header, found ${navs}.`,
      ).toBe(1);

      const navTag = html.slice(
        html.indexOf('<nav'),
        html.indexOf('>', html.indexOf('<nav')) + 1,
      );
      expect(
        navTag,
        'The <nav> needs an accessible name so assistive tech can tell it apart from the footer nav. Add aria-label="Primary" (or aria-labelledby) to the <nav>.',
      ).toMatch(/\baria-label(?:ledby)?="/);
    });

    it('renders each nav-link label exactly once across the whole header', () => {
      for (const link of navLinks) {
        const occurrences = headerInner.split(`>${link.label}<`).length - 1;
        expect(
          occurrences,
          `The label "${link.label}" appears ${occurrences} times in the header markup; expected exactly once. Both the desktop nav and the mobile drawer must read the same navLinks data — never re-type the labels as literals.`,
        ).toBe(1);
      }
    });
  });
});
