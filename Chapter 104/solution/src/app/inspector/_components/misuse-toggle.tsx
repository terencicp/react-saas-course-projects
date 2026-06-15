import { toggleMisuseRevalidate } from '@/app/inspector/cache-actions';
import { Button } from '@/components/ui/button';

// The deliberate failure-mode switch. When on, `updateInvoice` routes the LIST
// tag through `revalidateTag(list, 'max')` (the eventual primitive) instead of
// `updateTag` — the read-your-writes-vs-eventual contrast. Record + summary stay
// on `updateTag`. Production code never reads such a flag.
export const MisuseToggle = ({ on }: { on: boolean }) => (
  <section className="space-y-2">
    <h2 className="font-medium">Misuse: revalidateTag from action</h2>
    <p className="text-xs text-muted-foreground">
      When on, an edit routes the <span className="font-mono">list</span> tag
      through <span className="font-mono">revalidateTag</span> (eventual)
      instead of <span className="font-mono">updateTag</span>{' '}
      (read-your-writes).
    </p>
    <form action={toggleMisuseRevalidate} data-testid="misuse-toggle">
      <Button type="submit" size="sm" variant={on ? 'default' : 'outline'}>
        {on ? 'Misuse: ON' : 'Misuse: OFF'}
      </Button>
    </form>
  </section>
);
