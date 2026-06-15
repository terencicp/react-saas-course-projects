import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const featureCardVariants = cva(
  'flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-sm',
  {
    variants: {
      tone: {
        default: '',
        brand: 'border-primary/20 bg-primary/5',
        muted: 'bg-muted',
      },
      emphasis: {
        quiet: '',
        loud: 'shadow-md ring-1 ring-primary/20',
      },
    },
    defaultVariants: {
      tone: 'default',
      emphasis: 'quiet',
    },
  },
);

export type FeatureCardProps = ComponentProps<'article'> &
  VariantProps<typeof featureCardVariants> & {
    title: string;
    description: string;
    icon: LucideIcon;
  };

export const FeatureCard = ({
  title,
  description,
  icon: Icon,
  tone,
  emphasis,
  className,
  ...props
}: FeatureCardProps) => (
  <article
    data-testid="feature-card"
    className={cn(featureCardVariants({ tone, emphasis }), className)}
    {...props}
  >
    <CardHeader>
      <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <CardTitle className="text-lg">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  </article>
);
