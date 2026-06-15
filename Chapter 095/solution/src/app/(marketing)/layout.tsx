import type { ReactNode } from 'react';

// The marketing layout.
//
// SEEDED BONUS DEFECT #9 (finding 9, optional) — marketing-page font via a raw
// <link> (094 L1/L2): this loads a web font through a raw
// `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` instead of
// next/font. next/font ships fallback metrics so font-swap doesn't reflow and
// self-hosts so the font isn't a render-blocking third-party request on the LCP
// path. The healthy shape is next/font (self-hosted, fallback metrics). The target
// ships the bonus defect on purpose; finding 9 documents it (it is not patched).
const MarketingLayout = ({ children }: { children: ReactNode }) => (
  <>
    {/* SEEDED #9: render-blocking third-party font on the LCP path. */}
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap"
    />
    {children}
  </>
);

export default MarketingLayout;
