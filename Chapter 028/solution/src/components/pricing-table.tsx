import { PricingCard } from '@/components/pricing-card';
import { pricingTiers } from '@/lib/data';

export const PricingTable = () => (
  <section
    id="pricing"
    data-testid="pricing-table"
    className="container mx-auto flex flex-col gap-12 bg-background px-4 py-16 lg:py-24"
  >
    <div className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
        Pricing that scales with you
      </h2>
      <p className="text-lg text-pretty text-muted-foreground">
        Start free and upgrade as you grow. Every plan ships the same
        accessible, themed foundation.
      </p>
    </div>

    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
      {pricingTiers.map((tier) => (
        <PricingCard
          key={tier.name}
          {...tier}
          className={
            tier.featured
              ? 'md:scale-105 md:motion-reduce:scale-100'
              : undefined
          }
        />
      ))}
    </div>
  </section>
);
