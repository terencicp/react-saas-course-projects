# Chapter 028 — Codebase Summary

## Solution file tree

```
solution/
├── package.json                          # Project manifest, deps, scripts
├── next.config.ts                        # Next.js config (reactCompiler, turbopack)
├── tsconfig.json                         # TypeScript strict config, @/* path alias
├── components.json                       # shadcn/ui config (new-york style, neutral base)
├── biome.json                            # Biome formatter/linter config
├── vitest.config.ts                      # Vitest config (node env, tests/lessons/**)
├── postcss.config.mjs                    # PostCSS with @tailwindcss/postcss
├── next-env.d.ts                         # Next.js auto-generated type reference
└── src/
    ├── app/
    │   ├── globals.css                   # Tailwind v4 import + shadcn/ui CSS token system (light/dark)
    │   ├── layout.tsx                    # Root layout: metadata, Providers wrapper, html/body shell
    │   ├── page.tsx                      # Home page: SiteHeader + Hero + FeatureGrid + PricingTable + SiteFooter
    │   └── _components/
    │       └── providers.tsx             # Client boundary: ThemeProvider (next-themes) with system default
    ├── lib/
    │   ├── utils.ts                      # cn() helper (clsx + tailwind-merge)
    │   └── data.ts                       # Static site content: navLinks, features, pricingTiers, footerGroups, socialLinks
    ├── hooks/
    │   └── use-lock-body-scroll.ts       # Custom hook: locks body scroll when boolean arg is true
    ├── components/
    │   ├── hero.tsx                      # Hero section: h1, copy, two CTA buttons, ThemeAwareImage
    │   ├── feature-card.tsx              # Article card with cva variants (tone, emphasis)
    │   ├── feature-grid.tsx              # Section: heading + responsive 3-col grid of FeatureCards
    │   ├── pricing-card.tsx              # Article card: name/price/features list/CTA, featured branch
    │   ├── pricing-table.tsx             # Section: heading + 3-col grid of PricingCards, featured scale lift
    │   ├── site-header.tsx               # Sticky header: logo, desktop nav, ThemeToggle slot, MobileNav slot
    │   ├── site-footer.tsx               # Footer: brand block, three link-group navs, social icon buttons
    │   ├── theme-toggle.tsx              # Client: useTheme() button, CSS-only Sun/Moon swap
    │   ├── theme-aware-image.tsx         # Two <img> elements toggled via block dark:hidden / hidden dark:block
    │   ├── mobile-nav.tsx                # Client: Sheet drawer, trigger, link list, useLockBodyScroll
    │   └── ui/
    │       ├── button.tsx                # shadcn/ui Button (variant, size, asChild via Slot)
    │       ├── badge.tsx                 # shadcn/ui Badge (variant, asChild via Slot)
    │       ├── card.tsx                  # shadcn/ui Card family (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction)
    │       ├── sheet.tsx                 # shadcn/ui Sheet (Dialog-based slide panel, side prop)
    │       ├── separator.tsx             # shadcn/ui Separator (horizontal/vertical)
    │       └── skeleton.tsx              # shadcn/ui Skeleton (animate-pulse placeholder)
```

---

## Contracts

### `src/lib/utils.ts`
```ts
export const cn = (...inputs: ClassValue[]) => string
```

### `src/lib/data.ts`
```ts
export const navLinks: { href: string; label: string }[]
// [{ href: '#features', label: 'Features' }, ...]  — 4 items

export const features: FeatureCardProps[]
// 3 items: { title, description, icon: LucideIcon, tone, emphasis }

export const pricingTiers: PricingCardProps[]
// 3 items: { name, price, period, features[], cta, featured? }

export const footerGroups: { heading: string; links: { href: string; label: string }[] }[]
// 3 groups: Product, Company, Legal

export const socialLinks: { href: string; label: string; icon: LucideIcon }[]
// 4 items: Mail, Globe, Rss, Send
```

### `src/hooks/use-lock-body-scroll.ts`
```ts
export const useLockBodyScroll = (locked: boolean): void
// Effect: sets body overflow hidden when locked; restores prior value on cleanup
```

### `src/app/layout.tsx`
```ts
export const metadata: Metadata = { title: 'Themed Product Surface', description: '...' }
export default RootLayout: ({ children: ReactNode }) => JSX.Element
```

### `src/app/page.tsx`
```ts
export default Home: () => JSX.Element
// Renders: SiteHeader / Hero / FeatureGrid / PricingTable / SiteFooter
```

### `src/app/_components/providers.tsx`
```ts
export const Providers: ({ children: ReactNode }) => JSX.Element
// ThemeProvider: attribute="class", defaultTheme="system", enableSystem, disableTransitionOnChange
```

### `src/components/feature-card.tsx`
```ts
export const featureCardVariants: CVA
// variants: tone ('default' | 'brand' | 'muted'), emphasis ('quiet' | 'loud')

export type FeatureCardProps = ComponentProps<'article'> & VariantProps<typeof featureCardVariants> & {
  title: string
  description: string
  icon: LucideIcon
}

export const FeatureCard: (props: FeatureCardProps) => JSX.Element
// data-testid="feature-card"
```

### `src/components/feature-grid.tsx`
```ts
export const FeatureGrid: () => JSX.Element
// data-testid="feature-grid", id="features"
// Maps features[] from data.ts into a responsive md:grid-cols-3 grid
```

### `src/components/pricing-card.tsx`
```ts
export type PricingCardProps = ComponentProps<'article'> & {
  name: string
  price: string
  period: 'month' | 'year'
  features: string[]
  featured?: boolean
  cta: { label: string; href: string }
}

export const PricingCard: (props: PricingCardProps) => JSX.Element
// data-testid="pricing-card" | "pricing-card-featured" when featured
// Featured branch: border-primary ring-1 + "Most popular" Badge + default Button variant
```

### `src/components/pricing-table.tsx`
```ts
export const PricingTable: () => JSX.Element
// data-testid="pricing-table", id="pricing"
// Maps pricingTiers[] from data.ts; featured tier gets md:scale-105 md:motion-reduce:scale-100
```

### `src/components/hero.tsx`
```ts
export const Hero: () => JSX.Element
// data-testid="hero"
// h1, copy, two Buttons (asChild Link), ThemeAwareImage (light/dark hero images)
```

### `src/components/site-header.tsx`
```ts
export const SiteHeader: () => JSX.Element
// data-testid="site-header", sticky top-0 z-50
// Desktop nav hidden on mobile; data-testid="theme-toggle-slot", data-testid="header-mobile-slot"
```

### `src/components/site-footer.tsx`
```ts
export const SiteFooter: () => JSX.Element
// data-testid="site-footer"
// Brand block + footerGroups[] navs + socialLinks[] icon Buttons
```

### `src/components/theme-toggle.tsx`
```ts
// 'use client'
export const ThemeToggle: () => JSX.Element
// data-testid="theme-toggle", aria-label="Toggle theme"
// useTheme() → setTheme; Sun visible in light (dark:hidden), Moon visible in dark (hidden dark:block)
```

### `src/components/theme-aware-image.tsx`
```ts
export type ThemeAwareImageProps = {
  light: string; dark: string; alt: string; width: number; height: number
} & ComponentProps<'img'>

export const ThemeAwareImage: (props: ThemeAwareImageProps) => JSX.Element
// Renders two <img>: data-testid="hero-image-light" (block dark:hidden) + data-testid="hero-image-dark" (hidden dark:block)
```

### `src/components/mobile-nav.tsx`
```ts
// 'use client'
export const MobileNav: ({ links }: { links: { href: string; label: string }[] }) => JSX.Element
// Controlled Sheet (open state); data-testid="mobile-nav-trigger", data-testid="mobile-nav-content"
// useLockBodyScroll(open); links close Sheet on click; ThemeToggle in sheet footer area
```

### `src/components/ui/button.tsx`
```ts
const buttonVariants: CVA
// variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
// size: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'

export function Button(props: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }): JSX.Element
export { buttonVariants }
```

### `src/components/ui/badge.tsx`
```ts
const badgeVariants: CVA
// variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'

export function Badge(props: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }): JSX.Element
export { badgeVariants }
```

### `src/components/ui/card.tsx`
```ts
export function Card(props: ComponentProps<'div'>): JSX.Element
export function CardHeader(props: ComponentProps<'div'>): JSX.Element
export function CardTitle(props: ComponentProps<'div'>): JSX.Element
export function CardDescription(props: ComponentProps<'div'>): JSX.Element
export function CardAction(props: ComponentProps<'div'>): JSX.Element
export function CardContent(props: ComponentProps<'div'>): JSX.Element
export function CardFooter(props: ComponentProps<'div'>): JSX.Element
```

### `src/components/ui/sheet.tsx`
```ts
// 'use client' — wraps radix-ui Dialog as a slide-in panel
export function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>): JSX.Element
export function SheetTrigger(...): JSX.Element
export function SheetClose(...): JSX.Element
export function SheetContent(props: ... & { side?: 'top'|'right'|'bottom'|'left'; showCloseButton?: boolean }): JSX.Element
export function SheetHeader(props: ComponentProps<'div'>): JSX.Element
export function SheetFooter(props: ComponentProps<'div'>): JSX.Element
export function SheetTitle(...): JSX.Element
export function SheetDescription(...): JSX.Element
```

### `src/components/ui/separator.tsx`
```ts
// 'use client'
export function Separator(props: ComponentProps<typeof SeparatorPrimitive.Root>): JSX.Element
// orientation: 'horizontal'(default) | 'vertical'; decorative: true(default)
```

### `src/components/ui/skeleton.tsx`
```ts
export function Skeleton(props: ComponentProps<'div'>): JSX.Element
// animate-pulse rounded-md bg-accent
```

### `src/app/globals.css`
CSS token system (OKLCH, light + dark via `.dark` class):
- `--radius: 0.625rem`
- Semantic tokens: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- `@theme inline` block maps all tokens to Tailwind v4 `--color-*` and `--radius-*` utilities

### Config files

**`next.config.ts`** (verbatim):
```ts
const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: { root: __dirname },
};
```

**`components.json`** (verbatim):
```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "css": "src/app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```

---

## Dependencies

**Runtime**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| next-themes | ^0.4.6 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| lucide-react | ^1.17.0 |
| tw-animate-css | ^1.4.0 |

**Dev**
| Package | Version |
|---|---|
| @biomejs/biome | 2.4.16 |
| tailwindcss | ^4.3.0 |
| @tailwindcss/postcss | ^4.3.0 |
| typescript | ^6.0.3 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| @types/node | ^25.9.1 |
| @types/react | ^19.2.16 |
| @types/react-dom | ^19.2.3 |

---

## Start diff

The `start/` and `solution/` directories have identical configuration files (`package.json`, `next.config.ts`, `tsconfig.json`, `components.json`, `biome.json`, `vitest.config.ts`, `postcss.config.mjs`) and identical shadcn/ui primitives (`ui/button.tsx`, `ui/badge.tsx`, `ui/card.tsx`, `ui/sheet.tsx`, `ui/separator.tsx`, `ui/skeleton.tsx`), plus identical `globals.css`, `layout.tsx`, `page.tsx`, `providers.tsx`, `lib/utils.ts`, and `lib/data.ts`.

The only files that differ are the eleven component/hook files students must implement. Each start file provides a minimal scaffold (the correct component signature and `data-testid` attributes) with a single TODO comment. The solution files contain the full implementation.

**Files with TODOs in start/**

| File | TODO |
|---|---|
| `src/components/site-header.tsx` | `TODO(L6)` — build semantic header: logo, desktop nav from navLinks, empty toggle + mobile slots |
| `src/components/hero.tsx` | `TODO(L7)` — hero: one h1, supporting copy, two CTA buttons, theme-aware image |
| `src/components/feature-card.tsx` | `TODO(L8)` — featureCardVariants cva table + FeatureCard article |
| `src/components/feature-grid.tsx` | `TODO(L8)` — section + h2 + responsive grid mapping features |
| `src/components/pricing-card.tsx` | `TODO(L9)` — PricingCard with the featured branch (accent ring + badge) |
| `src/components/pricing-table.tsx` | `TODO(L9)` — section + h2 + grid mapping pricingTiers, featured lift with motion-reduce: |
| `src/components/site-footer.tsx` | `TODO(L10)` — footer: three link groups, brand block, labelled social icon buttons |
| `src/components/theme-toggle.tsx` | `TODO(L11)` — useTheme()-driven Button, CSS-only Sun/Moon swap, no mount gate |
| `src/components/theme-aware-image.tsx` | `TODO(L7)` — render both img sources with block dark:hidden / hidden dark:block |
| `src/components/mobile-nav.tsx` | `TODO(L12)` — controlled Sheet drawer: labelled trigger, SheetTitle, link list closing on click, useLockBodyScroll(open) |
| `src/hooks/use-lock-body-scroll.ts` | `TODO(L12)` — toggle body overflow hidden when locked, restore prior value on cleanup |

Each start scaffold preserves the component's public API (export name, props type, `data-testid` values) so tests written against start also pass against solution.
