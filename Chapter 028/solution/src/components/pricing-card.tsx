import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type PricingCardProps = ComponentProps<'article'> & {
  name: string;
  price: string;
  period: 'month' | 'year';
  features: string[];
  featured?: boolean;
  cta: { label: string; href: string };
};

export const PricingCard = ({
  name,
  price,
  period,
  features,
  featured = false,
  cta,
  className,
  ...props
}: PricingCardProps) => (
  <article
    data-testid={featured ? 'pricing-card-featured' : 'pricing-card'}
    className={cn(
      'flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-sm',
      featured && 'border-primary shadow-md ring-1 ring-primary',
      className,
    )}
    {...props}
  >
    <CardHeader className="gap-3">
      {featured ? <Badge className="mb-1">Most popular</Badge> : null}
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-foreground">
          {price}
        </span>
        <span className="text-muted-foreground">/ {period}</span>
      </p>
    </CardHeader>
    <CardContent>
      <ul className="flex flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-3">
            <Check className="size-4 text-primary" />
            <span className="text-sm text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </CardContent>
    <CardFooter>
      <Button
        asChild
        className="w-full"
        variant={featured ? 'default' : 'outline'}
      >
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    </CardFooter>
  </article>
);
