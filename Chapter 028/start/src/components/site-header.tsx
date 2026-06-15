export const SiteHeader = () => {
  // TODO(L6) — build the semantic header: logo, desktop nav from navLinks, empty toggle + mobile slots
  return (
    <header data-testid="site-header">
      <div data-testid="theme-toggle-slot" />
      <div data-testid="header-mobile-slot" className="md:hidden" />
    </header>
  );
};
