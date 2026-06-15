import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SiteFooter } from '@/components/site-footer';
import { footerGroups, socialLinks } from '@/lib/data';

// Node-env harness: no DOM, so we assert the server-rendered (first-paint)
// markup the footer produces. SiteFooter is a sync Server Component, so we
// invoke it as a function (this file is .ts, not .tsx) and render the element
// it returns. Every assertion below targets observable rendered output —
// accessible names, landmarks, link text — never file paths or class names.
const html = renderToStaticMarkup(SiteFooter());

// The markup of the single <footer> landmark, from its opening tag to </footer>.
const footerMarkup = (() => {
  const open = html.indexOf('<footer');
  const close = html.lastIndexOf('</footer>');
  return open === -1 || close === -1 ? '' : html.slice(open, close);
})();

// Every social anchor in the footer is an icon-only control: an <a> carrying an
// aria-label that wraps a decorative lucide <svg>. We pull each anchor's full
// markup (opening tag through its closing </a>) so we can read its accessible
// name and confirm the glyph inside adds no competing text.
const socialAnchors = (() => {
  const labels = new Set(socialLinks.map((link) => link.label));
  const anchors: { label: string; markup: string }[] = [];
  const open = /<a\b[^>]*\baria-label="([^"]*)"[^>]*>/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex walk
  while ((match = open.exec(footerMarkup)) !== null) {
    const label = match[1] ?? '';
    if (!labels.has(label)) continue;
    const close = footerMarkup.indexOf('</a>', open.lastIndex);
    anchors.push({
      label,
      markup: footerMarkup.slice(match.index, close === -1 ? undefined : close),
    });
  }
  return anchors;
})();

describe('Lesson 10 — Site footer', () => {
  // Requirement 1: the footer renders the three link groups (heading + links),
  // the brand wordmark, and the copyright line.
  describe('renders the link groups, the brand wordmark, and the copyright line', () => {
    it('shows the "Acme" brand wordmark', () => {
      expect(
        footerMarkup,
        'The footer is missing the "Acme" brand wordmark. The project uses a text wordmark (a link reading "Acme"), not a logo image — render it in the brand block.',
      ).toContain('Acme');
    });

    it('renders every footer group heading from footerGroups', () => {
      for (const group of footerGroups) {
        expect(
          footerMarkup,
          `The footer is missing the "${group.heading}" group heading. Map over footerGroups and render each group's heading instead of hand-placing columns.`,
        ).toContain(`>${group.heading}<`);
      }
    });

    it('renders every link label and href from footerGroups', () => {
      for (const group of footerGroups) {
        for (const link of group.links) {
          expect(
            footerMarkup,
            `The "${group.heading}" column is missing the "${link.label}" link. Map over each group's links[] into the column.`,
          ).toContain(`>${link.label}<`);
          expect(
            footerMarkup,
            `The "${link.label}" link does not point at its href ("${link.href}"). Render each footer link as a link to link.href.`,
          ).toContain(`href="${link.href}"`);
        }
      }
    });

    it('shows the copyright line', () => {
      expect(
        footerMarkup,
        'The footer is missing its copyright line (e.g. "© 2026 Acme, Inc. …"). Add the copyright paragraph at the bottom of the footer.',
      ).toMatch(/©[\s\S]*2026[\s\S]*Acme/);
    });
  });

  // Requirement 2: each social icon button exposes an accessible label naming
  // its destination, and the lucide glyph adds no competing accessible text.
  // Under <Button asChild>, the label and href live on the child <a>; the icon
  // is decorative (aria-hidden), so the label is the control's only name.
  describe('labels every social icon button and hides the decorative glyph', () => {
    it('renders one labelled social control per entry in socialLinks', () => {
      expect(
        socialAnchors.length,
        `Expected one labelled social control per entry in socialLinks (${socialLinks.length}), found ${socialAnchors.length}. Map over socialLinks and put the aria-label on each control's <a> (it carries the name under <Button asChild>, not the <Button>).`,
      ).toBe(socialLinks.length);
    });

    it("uses each link's label as the control's accessible name and links to its href", () => {
      for (const link of socialLinks) {
        const anchor = socialAnchors.find((a) => a.label === link.label);
        expect(
          anchor,
          `No social control announces "${link.label}". An icon-only control is a silent a11y failure until it carries an accessible name — give each social <a> an aria-label equal to its socialLinks label.`,
        ).toBeDefined();
        expect(
          anchor?.markup ?? '',
          `The "${link.label}" social control does not link to its destination ("${link.href}"). Put the href on the same <a> that carries the aria-label.`,
        ).toContain(`href="${link.href}"`);
      }
    });

    it('keeps the lucide glyph decorative so it adds no competing accessible name', () => {
      for (const anchor of socialAnchors) {
        const svg = anchor.markup.match(/<svg\b[^>]*>/)?.[0] ?? '';
        expect(
          svg,
          `The "${anchor.label}" social control renders an icon but the icon is not present where expected. Render the lucide glyph inside the control.`,
        ).not.toBe('');
        expect(
          svg.includes('aria-hidden="true"'),
          `The icon inside the "${anchor.label}" social control is not hidden from assistive tech (aria-hidden), so it competes with the control's label. Lucide marks its <svg> decorative by default — keep the glyph hidden so the aria-label is the only accessible name.`,
        ).toBe(true);
        // The glyph must contribute no text of its own: no aria-label / title
        // on the svg that would override or duplicate the control's name.
        expect(
          /aria-label=|<title>/.test(
            anchor.markup
              .slice(0, anchor.markup.indexOf('</svg>') + 6)
              .replace(/<a\b[^>]*>/, ''),
          ),
          `The icon inside the "${anchor.label}" social control carries its own accessible text (an aria-label or <title>), which competes with the control's name. The glyph should be purely decorative.`,
        ).toBe(false);
      }
    });
  });

  // Requirement 4: the footer is a single <footer> landmark (one contentinfo).
  describe('exposes exactly one footer landmark', () => {
    it('renders exactly one <footer> contentinfo landmark', () => {
      const count = (html.match(/<footer\b/g) ?? []).length;
      expect(
        count,
        `The footer band must be a single <footer> landmark, but ${count} were rendered. Wrap the whole footer in exactly one <footer>; the link columns are <nav> landmarks, not nested footers.`,
      ).toBe(1);
    });
  });
});
