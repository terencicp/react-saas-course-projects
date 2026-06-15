import { readFileSync } from 'node:fs';
import type { EffectCallback, ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Why this file mocks `useEffect`.
//
// This chapter's harness runs in the `node` environment with no DOM and no
// commit-phase renderer (no jsdom, no react-test-renderer). `renderToStaticMarkup`
// never fires effects, so we cannot observe `useLockBodyScroll` by mounting it.
// Instead we intercept the effect React would schedule, then run it ourselves
// against a fake `document` — that lets us assert the *real* body-overflow
// behaviour the hook produces, not a regex over its source. The stub returns
// nothing, which is exactly how SSR treats effects, so MobileNav still renders
// its trigger markup faithfully under the same mock.
// ---------------------------------------------------------------------------
type CapturedEffect = { fn: EffectCallback; deps?: unknown[] };
let capturedEffect: CapturedEffect | null = null;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (fn: EffectCallback, deps?: unknown[]) => {
      capturedEffect = { fn, deps };
    },
  };
});

const { MobileNav } = await import('@/components/mobile-nav');
const { useLockBodyScroll } = await import('@/hooks/use-lock-body-scroll');

// The same nav links the desktop header passes down. A single representative
// item is enough to prove the drawer is single-sourced from `links`.
const links = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
];

// First-paint markup of the mobile nav. In SSR the Sheet is closed, so only the
// trigger button is emitted — the drawer panel lives in a portal that mounts on
// open and is intentionally absent here. We assert against the trigger, which is
// the part the page actually paints before any interaction.
const renderMobileNav = () =>
  renderToStaticMarkup(createElement(MobileNav, { links }) as ReactElement);

// Read a student source file relative to the project root (tests/lessons/..).
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const mobileNavSource = () => readSource('src/components/mobile-nav.tsx');

// Drive the hook's effect deterministically against a fake body style, then run
// its cleanup. Returns the overflow value right after mount and after cleanup.
const runLockEffect = (locked: boolean, priorOverflow: string) => {
  (globalThis as unknown as { document: unknown }).document = {
    body: { style: { overflow: priorOverflow } },
  };
  capturedEffect = null;
  useLockBodyScroll(locked);
  const effect = capturedEffect as CapturedEffect | null;
  if (!effect) {
    throw new Error(
      'useLockBodyScroll scheduled no effect. Wrap the body-scroll logic in a useEffect keyed on [locked] so it runs on the client when the lock state changes.',
    );
  }
  const cleanup = effect.fn();
  const body = (
    globalThis as unknown as {
      document: { body: { style: { overflow: string } } };
    }
  ).document.body.style;
  const afterMount = body.overflow;
  if (typeof cleanup === 'function') cleanup();
  return { afterMount, afterCleanup: body.overflow, deps: effect.deps };
};

describe('Lesson 12 — Mobile drawer with scroll lock', () => {
  // Requirement 1: below md, a labelled hamburger opens a left-side drawer.
  // What the page paints is the trigger: it must be a real, accessibly-named
  // button that announces it opens a dialog — an inert placeholder button does
  // none of that. The "left side" is a prop on the drawer panel (portalled away
  // in SSR), so we read it from the controlled Sheet the component returns.
  describe('a labelled hamburger opens a left-side drawer', () => {
    it('paints a real button as the trigger', () => {
      const button = renderMobileNav().match(/<button\b[^>]*>/)?.[0] ?? '';
      expect(
        button,
        'The mobile nav has no <button> trigger. Wrap a real <Button> in <SheetTrigger asChild> so the hamburger is keyboard-focusable and activatable for free.',
      ).not.toBe('');
      expect(
        button,
        'The hamburger is missing type="button", so inside a form it could submit. Give the trigger Button type="button".',
      ).toContain('type="button"');
    });

    it('names the icon-only trigger for assistive tech', () => {
      expect(
        renderMobileNav(),
        'The hamburger has no accessible name, so screen-reader users hear only "button". Give the icon trigger aria-label="Open menu".',
      ).toContain('aria-label="Open menu"');
    });

    it('wires the trigger to a dialog disclosure, not an inert button', () => {
      const html = renderMobileNav();
      expect(
        html,
        'The trigger does not announce that it opens a dialog. Render it through <SheetTrigger> (shadcn Sheet = Radix Dialog) so it ships aria-haspopup="dialog" and the open/closed wiring instead of being an inert <button>.',
      ).toContain('aria-haspopup="dialog"');
      expect(
        html,
        'The trigger is not connected to the drawer it controls. <SheetTrigger> wires aria-controls to the panel id — render the hamburger through it so the disclosure relationship is announced.',
      ).toContain('aria-controls=');
    });

    it('slides the drawer in from the left', () => {
      expect(
        mobileNavSource(),
        'The drawer is not anchored to the left. Pass side="left" to <SheetContent> so the panel slides in from the start edge as the brief specifies.',
      ).toMatch(/side=["']left["']/);
    });
  });

  // Requirement 2: tapping a link must navigate AND close the drawer in one
  // action. The link list is single-sourced from `links` (the same array the
  // desktop nav uses) and each entry carries both an href (navigate) and an
  // onClick that flips the controlled open state to false (close).
  describe('tapping a link navigates and closes the drawer in one action', () => {
    it('maps the drawer links from the passed `links`, not a hand-written list', () => {
      const src = mobileNavSource();
      expect(
        src,
        'The drawer hard-codes its links instead of single-sourcing them. Map over the `links` prop so the desktop and mobile navs stay one list.',
      ).toMatch(/links\s*\.map\s*\(/);
    });

    it('gives each link an href so the tap navigates', () => {
      expect(
        mobileNavSource(),
        'The drawer links have no destination. Render each item as a <Link href={...}> so tapping it navigates.',
      ).toMatch(/href=\{[^}]*\}/);
    });

    it('closes the drawer on link tap by flipping the open state to false', () => {
      const src = mobileNavSource();
      expect(
        src,
        'Tapping a link navigates but leaves the drawer open. Give each <Link> an onClick that closes the Sheet, e.g. onClick={() => setOpen(false)}, so navigate-and-close happen together.',
      ).toMatch(/onClick=\{[^}]*setOpen\(\s*false\s*\)/);
    });
  });

  // Requirement 3: the open drawer must expose an accessible name. Radix Dialog
  // errors without one, so a <SheetTitle> is mandatory inside <SheetContent>.
  // The title lives in the portal (not in SSR markup), so we read the source.
  describe('the open drawer exposes an accessible name', () => {
    it('renders a SheetTitle inside the drawer panel', () => {
      const src = mobileNavSource();
      expect(
        src,
        'The drawer has no accessible name. shadcn Sheet (Radix Dialog) requires a <SheetTitle> inside <SheetContent> — without it the dialog is unnamed and Radix logs an error. Add one.',
      ).toMatch(/<SheetTitle[\s>]/);
    });
  });

  // Requirement 4: while the drawer is open the page behind must not scroll, and
  // closing must restore scroll to its PRIOR value — never a blanket reset to
  // ''. This is the one behaviour the project owns; we run its effect against a
  // fake body to observe the real overflow toggling, not its source text.
  describe('the drawer locks body scroll and restores the prior value', () => {
    it('sets body overflow to hidden while locked', () => {
      const { afterMount } = runLockEffect(true, 'scroll');
      expect(
        afterMount,
        `While the drawer is open, document.body.style.overflow should be "hidden" but was "${afterMount}". Set document.body.style.overflow = 'hidden' in the effect when locked.`,
      ).toBe('hidden');
    });

    it('restores the prior overflow value on cleanup, not a blank reset', () => {
      const { afterCleanup } = runLockEffect(true, 'scroll');
      expect(
        afterCleanup,
        `On close, overflow should return to its prior value ("scroll") but was "${afterCleanup}". Capture document.body.style.overflow before setting 'hidden', and restore that captured value in the cleanup — restoring '' would clobber an outer lock.`,
      ).toBe('scroll');
    });

    it('leaves body overflow untouched while unlocked', () => {
      const { afterMount, afterCleanup } = runLockEffect(false, 'auto');
      expect(
        afterMount === 'auto' && afterCleanup === 'auto',
        `An unlocked drawer must not touch body scroll, but overflow changed (mount="${afterMount}", cleanup="${afterCleanup}"). Early-return from the effect when !locked before touching document.body.`,
      ).toBe(true);
    });

    it('re-runs the lock only when the locked flag changes', () => {
      const { deps } = runLockEffect(true, 'scroll');
      expect(
        deps,
        `The lock effect's dependency array is ${JSON.stringify(deps)}, so it runs at the wrong times. Key the effect on [locked] so it toggles exactly when the drawer opens and closes.`,
      ).toEqual([true]);
    });
  });
});
