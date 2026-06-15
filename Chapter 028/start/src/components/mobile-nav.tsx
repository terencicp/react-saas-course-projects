'use client';

export type MobileNavProps = {
  links: { href: string; label: string }[];
};

export const MobileNav = (_props: MobileNavProps) => {
  // TODO(L12) — controlled Sheet drawer: labelled trigger, SheetTitle, link list closing on click, useLockBodyScroll(open)
  return (
    <button
      type="button"
      data-testid="mobile-nav-trigger"
      aria-label="Open menu"
    />
  );
};
