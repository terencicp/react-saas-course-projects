import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

// The marketing landing page (unauthenticated, served at `/`).
//
// SEEDED AUDIT DEFECT #7 (finding 7, L2 — the reference finding) — the LCP image is
// not eager-loaded (094 L2): the hero <Image> ships src/alt/width/height but NOT the
// eager-load prop (renamed from `priority` in Next.js 16). The browser discovers the
// LCP image late, so LCP regresses past 2.5s. The page renders fine. The documented
// fix (not applied) marks the hero for eager load, adds the no-img-element ESLint
// rule, and keeps width/height for CLS. See findings/007-missing-priority.md.
const MarketingPage = () => (
  <main className="mx-auto max-w-5xl px-6 py-16">
    <section
      data-testid="marketing-hero"
      className="flex flex-col items-center gap-8 text-center"
    >
      {/* SEEDED #7: the LCP image is not marked for eager load. */}
      <Image
        src="/hero.png"
        alt="Acme dashboard preview"
        width={1280}
        height={720}
        className="w-full max-w-3xl rounded-xl border shadow-sm"
      />
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
        Run your business on Acme
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Invoices, teams, and billing in one place. Built for the teams shipping
        in 2026.
      </p>
      <Button asChild>
        <Link href="/sign-in">Get started</Link>
      </Button>
    </section>
  </main>
);

export default MarketingPage;
