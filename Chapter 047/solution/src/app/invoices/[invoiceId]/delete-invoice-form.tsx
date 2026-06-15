'use client';

import { useActionState } from 'react';

import { SubmitButton } from '@/app/_components/submit-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { deleteInvoice } from '@/lib/invoices/actions';

type DeleteInvoiceFormProps = {
  invoiceId: string;
  invoiceNumber: string;
};

export const DeleteInvoiceForm = ({
  invoiceId,
  invoiceNumber,
}: DeleteInvoiceFormProps) => {
  const [state, formAction] = useActionState(deleteInvoice, null);

  return (
    <section data-testid="delete-invoice-form" className="flex flex-col gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            data-testid="delete-trigger"
          >
            Delete
          </Button>
        </DialogTrigger>
        <DialogContent data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete invoice {invoiceNumber}?</DialogTitle>
            <DialogDescription>
              This permanently removes the invoice and its line items. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction}>
            <input type="hidden" name="id" defaultValue={invoiceId} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <SubmitButton variant="destructive">Delete</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <form action={formAction} data-testid="delete-fallback-form">
        <input type="hidden" name="id" defaultValue={invoiceId} />
        <SubmitButton variant="destructive">Delete invoice</SubmitButton>
      </form>

      {state?.ok === false && (
        <p role="alert" className="text-destructive">
          {state.error.userMessage}
        </p>
      )}
    </section>
  );
};
