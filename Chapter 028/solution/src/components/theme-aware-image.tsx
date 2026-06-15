import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type ThemeAwareImageProps = {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
} & ComponentProps<'img'>;

export const ThemeAwareImage = ({
  light,
  dark,
  alt,
  width,
  height,
  className,
  ...props
}: ThemeAwareImageProps) => (
  <>
    <img
      data-testid="hero-image-light"
      src={light}
      alt={alt}
      width={width}
      height={height}
      className={cn('block dark:hidden', className)}
      {...props}
    />
    <img
      data-testid="hero-image-dark"
      src={dark}
      alt={alt}
      width={width}
      height={height}
      className={cn('hidden dark:block', className)}
      {...props}
    />
  </>
);
