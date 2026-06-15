import {
  Globe,
  type LucideIcon,
  Mail,
  Rss,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import type { FeatureCardProps } from '@/components/feature-card';
import type { PricingCardProps } from '@/components/pricing-card';

export const navLinks: { href: string; label: string }[] = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#docs', label: 'Docs' },
  { href: '#blog', label: 'Blog' },
];

export const features: FeatureCardProps[] = [
  {
    title: 'Ship in minutes',
    description:
      'A batteries-included stack so you spend your time on product, not plumbing.',
    icon: Zap,
    tone: 'brand',
    emphasis: 'loud',
  },
  {
    title: 'Secure by default',
    description:
      'Sensible defaults and a hardened baseline keep your surface safe from day one.',
    icon: ShieldCheck,
    tone: 'default',
    emphasis: 'quiet',
  },
  {
    title: 'Delightful details',
    description:
      'Accessible, themed, and responsive — the polish your users feel without naming it.',
    icon: Sparkles,
    tone: 'muted',
    emphasis: 'quiet',
  },
];

export const pricingTiers: PricingCardProps[] = [
  {
    name: 'Starter',
    price: '$0',
    period: 'month',
    features: ['1 project', 'Community support', 'Basic analytics'],
    cta: { label: 'Get started', href: '#signup' },
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'month',
    features: [
      'Unlimited projects',
      'Priority support',
      'Advanced analytics',
      'Custom domains',
    ],
    featured: true,
    cta: { label: 'Start free trial', href: '#signup' },
  },
  {
    name: 'Team',
    price: '$49',
    period: 'month',
    features: ['Everything in Pro', 'Role-based access', 'Audit logs', 'SSO'],
    cta: { label: 'Contact sales', href: '#contact' },
  },
];

export const footerGroups: {
  heading: string;
  links: { href: string; label: string }[];
}[] = [
  {
    heading: 'Product',
    links: [
      { href: '#features', label: 'Features' },
      { href: '#pricing', label: 'Pricing' },
      { href: '#changelog', label: 'Changelog' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '#about', label: 'About' },
      { href: '#careers', label: 'Careers' },
      { href: '#contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '#privacy', label: 'Privacy' },
      { href: '#terms', label: 'Terms' },
      { href: '#security', label: 'Security' },
    ],
  },
];

export const socialLinks: { href: string; label: string; icon: LucideIcon }[] =
  [
    { href: '#email', label: 'Email us', icon: Mail },
    { href: '#website', label: 'Visit our website', icon: Globe },
    { href: '#rss', label: 'Subscribe to our feed', icon: Rss },
    { href: '#newsletter', label: 'Join our newsletter', icon: Send },
  ];
