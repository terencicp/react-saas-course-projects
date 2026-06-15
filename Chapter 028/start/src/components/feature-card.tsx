import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

export type FeatureCardProps = ComponentProps<'article'> & {
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: 'default' | 'brand' | 'muted';
  emphasis?: 'quiet' | 'loud';
};

export const FeatureCard = ({ title }: FeatureCardProps) => {
  // TODO(L8) — featureCardVariants cva table + FeatureCard <article>
  return <article data-testid="feature-card">{title}</article>;
};
