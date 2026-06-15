import {
  archiveOneInvoice,
  deleteOneInvoice,
  editOneInvoice,
  restoreOneInvoice,
  runSummaryJob,
} from '@/app/inspector/cache-actions';
import { Button } from '@/components/ui/button';

// The cache-driving buttons. Each posts to a `cache-actions.ts` server action
// (server-rendered forms — no client hooks needed). The actions redirect back to
// /inspector with a `?result=` the page surfaces in `action-result`.
export const CacheButtons = () => (
  <section className="space-y-3">
    <h2 className="font-medium">Cache actions</h2>
    <div className="flex flex-wrap gap-2">
      <form action={editOneInvoice}>
        <Button
          data-testid="edit-one-invoice"
          type="submit"
          size="sm"
          variant="outline"
        >
          Edit one invoice
        </Button>
      </form>
      <form action={archiveOneInvoice}>
        <Button
          data-testid="archive-one-invoice"
          type="submit"
          size="sm"
          variant="outline"
        >
          Archive one invoice
        </Button>
      </form>
      <form action={restoreOneInvoice}>
        <Button
          data-testid="restore-one-invoice"
          type="submit"
          size="sm"
          variant="outline"
        >
          Restore one invoice
        </Button>
      </form>
      <form action={deleteOneInvoice}>
        <Button
          data-testid="delete-one-invoice"
          type="submit"
          size="sm"
          variant="outline"
        >
          Delete one invoice
        </Button>
      </form>
      <form action={runSummaryJob}>
        <Button
          data-testid="run-summary-job"
          type="submit"
          size="sm"
          variant="outline"
        >
          Run summary task
        </Button>
      </form>
    </div>
  </section>
);
