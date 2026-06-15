export type PricingCardProps = {
  name: string;
  price: string;
  period: 'month' | 'year';
  features: string[];
  featured?: boolean;
  cta: { label: string; href: string };
};

export const PricingCard = ({ name, featured }: PricingCardProps) => {
  // TODO(L9) — PricingCard with the featured branch (accent ring + badge)
  return (
    <article data-testid={featured ? 'pricing-card-featured' : 'pricing-card'}>
      {name}
    </article>
  );
};
