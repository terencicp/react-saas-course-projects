import { cn } from '@/lib/utils';

// The "Upstash up?" badge: green when the live DB answers, red on failure or when
// "Force Upstash down" is on. One element (single-slot).
export const UpstashBadge = ({ up }: { up: boolean }) => (
  <span
    data-testid="upstash-badge"
    data-up={up}
    className={cn(
      'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
      up
        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    )}
  >
    <span
      className={cn('size-2 rounded-full', up ? 'bg-green-600' : 'bg-red-600')}
    />
    Upstash {up ? 'up' : 'down'}
  </span>
);
