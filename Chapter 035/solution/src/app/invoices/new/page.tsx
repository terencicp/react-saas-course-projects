import Link from 'next/link';

import { InvoiceForm } from '@/components/invoice-form';
import { Button } from '@/components/ui/button';

const NewPage = () => (
  <section className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>
      <p className="text-sm text-muted-foreground">
        Fill in the details to create an invoice.
      </p>
    </header>

    <InvoiceForm />

    <Button asChild variant="outline" className="self-start">
      <Link href="/invoices">Cancel</Link>
    </Button>
  </section>
);

export default NewPage;
