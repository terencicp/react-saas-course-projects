import { FeatureCard } from '@/components/feature-card';
import { features } from '@/lib/data';

export const FeatureGrid = () => (
  <section
    id="features"
    data-testid="feature-grid"
    className="container mx-auto flex flex-col gap-12 px-4 py-16 lg:py-24"
  >
    <div className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
        Everything you need to launch
      </h2>
      <p className="text-lg text-pretty text-muted-foreground">
        A focused set of building blocks that handle the hard parts, so you can
        ship a polished product from day one.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {features.map((feature) => (
        <FeatureCard key={feature.title} {...feature} />
      ))}
    </div>
  </section>
);
