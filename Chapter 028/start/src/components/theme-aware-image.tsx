import type { ComponentProps } from 'react';

export type ThemeAwareImageProps = {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
} & ComponentProps<'img'>;

export const ThemeAwareImage = (_props: ThemeAwareImageProps) => {
  // TODO(L7) — render both <img> sources with block dark:hidden / hidden dark:block
  return <span data-testid="theme-aware-image" />;
};
