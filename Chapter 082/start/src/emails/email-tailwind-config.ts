import { pixelBasedPreset } from 'react-email';

// The shared email Tailwind config. pixelBasedPreset converts rem to px so the
// utilities survive email clients that ignore root font-size. Brand tokens are
// hex (not the app's CSS variables) because email has no access to the app's
// theme; the CTA uses `bg-brand`/`text-brand-foreground`, never raw zinc/hex.
export const emailTailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        brand: '#4f46e5',
        'brand-foreground': '#ffffff',
        muted: '#71717a',
      },
    },
  },
};

export default emailTailwindConfig;
