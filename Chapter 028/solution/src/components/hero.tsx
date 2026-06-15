import Link from 'next/link';

import { ThemeAwareImage } from '@/components/theme-aware-image';
import { Button } from '@/components/ui/button';

export const Hero = () => (
  <section
    data-testid="hero"
    className="container mx-auto grid items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24"
  >
    <div className="flex flex-col items-start gap-6">
      <h1 className="text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
        The themed product surface your users feel.
      </h1>
      <p className="max-w-prose text-lg text-pretty text-muted-foreground">
        Acme ships an accessible, responsive marketing surface with
        byte-identical light and dark themes — so you launch polished from the
        very first paint.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg">
          <Link href="#signup">Start free trial</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="#features">See features</Link>
        </Button>
      </div>
    </div>

    <ThemeAwareImage
      light="/hero-light.png"
      dark="/hero-dark.png"
      alt="A preview of the Acme product dashboard"
      width={1200}
      height={800}
      className="h-auto w-full rounded-xl border border-border"
    />
  </section>
);
