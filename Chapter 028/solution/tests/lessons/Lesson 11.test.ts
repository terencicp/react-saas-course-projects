import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// next-themes is a client hook that needs a React render context, which the
// node-env harness has no DOM for. We mock it so `useTheme()` returns a
// controllable `resolvedTheme` plus a spy `setTheme`, turning ThemeToggle into
// a plain function we can both render to first-paint markup AND call directly
// to inspect the click handler — without ever touching the browser machinery.
// `currentResolvedTheme` is what next-themes reports the page is actually
// showing (it resolves "system" to a concrete "light"/"dark" for us).
let currentResolvedTheme: 'light' | 'dark' = 'light';
const setTheme = vi.fn<(value: string) => void>();
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: currentResolvedTheme, setTheme }),
}));

const { ThemeToggle } = await import('@/components/theme-toggle');

// Render the toggle's first-paint markup. With the hook mocked, ThemeToggle is
// a pure function and renders deterministically — proving its markup needs no
// mount gate to be server-safe.
const renderToggle = () => renderToStaticMarkup(ThemeToggle() as ReactElement);

// Walk the element tree ThemeToggle returns and surface the first onClick — the
// toggle's click handler — so we can invoke it as a real click would.
type ElementLike = {
  props?: { onClick?: (...args: unknown[]) => void; children?: unknown };
};
const findOnClick = (
  node: unknown,
): ((...args: unknown[]) => void) | undefined => {
  if (!node || typeof node !== 'object') return undefined;
  const el = node as ElementLike;
  if (typeof el.props?.onClick === 'function') return el.props.onClick;
  const kids = el.props?.children;
  const list = Array.isArray(kids) ? kids : [kids];
  for (const kid of list) {
    const found = findOnClick(kid);
    if (found) return found;
  }
  return undefined;
};

// The single <svg> glyph carrying a given Tailwind class, or undefined.
const svgWithClass = (html: string, cls: string) =>
  html
    .match(/<svg\b[^>]*>/g)
    ?.find((tag) => new RegExp(`class="[^"]*\\b${cls}\\b`).test(tag));

describe('Lesson 11 — Flicker-free theme toggle', () => {
  // Requirement 1: clicking the toggle flips the whole page between light and
  // dark. The page's theme flips when the click handler writes the *opposite*
  // of the theme currently showing — and it must read `resolvedTheme` (the
  // concrete light/dark the page shows), never `theme` (which can be "system").
  describe('clicking flips the page between light and dark', () => {
    it('switches to dark when the page is currently light', () => {
      currentResolvedTheme = 'light';
      setTheme.mockClear();

      const onClick = findOnClick(ThemeToggle());
      expect(
        typeof onClick,
        'The toggle has no click handler, so clicking it does nothing. Give the <Button> an onClick that calls setTheme() from useTheme().',
      ).toBe('function');

      onClick?.();
      expect(
        setTheme.mock.calls,
        `Clicking on a light page must switch to dark, but setTheme was called with ${JSON.stringify(setTheme.mock.calls)}. In onClick, flip to the opposite of resolvedTheme: setTheme(resolvedTheme === 'dark' ? 'light' : 'dark').`,
      ).toEqual([['dark']]);
    });

    it('switches to light when the page is currently dark', () => {
      currentResolvedTheme = 'dark';
      setTheme.mockClear();

      const onClick = findOnClick(ThemeToggle());
      onClick?.();
      expect(
        setTheme.mock.calls,
        `Clicking on a dark page must switch to light, but setTheme was called with ${JSON.stringify(setTheme.mock.calls)}. The flip is binary: read resolvedTheme and write its opposite.`,
      ).toEqual([['light']]);
    });

    it('reads the resolved theme, not the literal "system" setting', () => {
      // When next-themes resolves "system" to a concrete "light", a click must
      // still produce a concrete "dark" — never echo "system" or an empty flip.
      currentResolvedTheme = 'light';
      setTheme.mockClear();

      findOnClick(ThemeToggle())?.();
      const written = setTheme.mock.calls[0]?.[0];
      expect(
        ['light', 'dark'].includes(written as string),
        `The toggle wrote ${JSON.stringify(written)} instead of a concrete "light"/"dark". Branch on resolvedTheme (which is already concrete), not on theme (which can be "system").`,
      ).toBe(true);
    });
  });

  // Requirement 4: the toggle is an icon button with an accessible label and a
  // decorative, hidden-per-theme icon pair. Both icons ship in first-paint
  // markup; the .dark class on <html> — not JS — picks which one displays.
  describe('renders a labelled icon button with a per-theme icon pair', () => {
    it('names the control with an accessible label', () => {
      const html = renderToggle();
      expect(
        html,
        'The toggle has no accessible name, so screen-reader users hear only "button". Give the control aria-label="Toggle theme".',
      ).toContain('aria-label="Toggle theme"');
    });

    it('renders a real <button> (Enter/Space-activatable for free)', () => {
      const html = renderToggle();
      const button = html.match(/<button\b[^>]*>/)?.[0] ?? '';
      expect(
        button,
        'The toggle is not a real <button>. Render it as a <Button> (a native button) so it is keyboard-focusable and fires on Enter/Space with no extra code.',
      ).not.toBe('');
      expect(
        button,
        'The toggle button is missing type="button", so inside a form it could submit. Set type="button".',
      ).toContain('type="button"');
    });

    it('ships both the sun and the moon glyph in first-paint markup', () => {
      const html = renderToggle();
      const svgCount = (html.match(/<svg\b/g) ?? []).length;
      expect(
        svgCount,
        `Expected both a sun and a moon icon in the markup, found ${svgCount} icon(s). Render <Sun> and <Moon> together so the server and client emit identical markup — that byte-identical output is what removes the hydration mismatch and makes a mount gate unnecessary.`,
      ).toBe(2);
    });

    it('keeps both glyphs decorative so the label is the only accessible name', () => {
      const html = renderToggle();
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) {
        expect(
          svg.includes('aria-hidden="true"'),
          'An icon glyph is announced to assistive tech and competes with the button label. The Sun/Moon glyphs are decorative — lucide hides them by default; keep them aria-hidden so aria-label="Toggle theme" is the only accessible name.',
        ).toBe(true);
      }
    });

    it('hides each glyph in the opposite theme via a pure CSS class swap', () => {
      const html = renderToggle();
      // Sun shows at base (no .dark) and hides under .dark.
      const sun = svgWithClass(html, 'dark:hidden');
      expect(
        sun,
        'The sun glyph is not hidden in dark mode. Give the <Sun> the "dark:hidden" class so the .dark class on <html> — not JavaScript — turns it off.',
      ).toBeTruthy();
      // Moon is the mirror: hidden at base, shown only under .dark.
      const moon = svgWithClass(html, 'dark:block');
      expect(
        moon,
        'The moon glyph is not shown in dark mode. Give the <Moon> the "hidden dark:block" classes so it stays out at base and appears only under .dark.',
      ).toBeTruthy();
      expect(
        moon,
        'The moon glyph is missing its base "hidden" class, so both icons could show at once in light mode. Pair "dark:block" with a leading "hidden".',
      ).toMatch(/class="[^"]*\bhidden\b/);
      // The two CSS rules must land on different glyphs, not one element.
      expect(
        sun,
        'The same glyph carries both the show-in-light and show-in-dark rules. The swap needs two separate icons: <Sun className="dark:hidden" /> and <Moon className="hidden dark:block" />.',
      ).not.toBe(moon);
    });
  });
});
