'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InvoiceChatProps = {
  orgName: string;
};

// TODO(L2) — smoke-test useChat client; TODO(L5) — full typed parts-rendering client
export const InvoiceChat = ({ orgName }: InvoiceChatProps) => (
  <div
    data-testid="invoice-chat"
    className="flex h-full flex-col gap-3 rounded-lg border p-4"
  >
    <div>
      <h2 className="text-sm font-medium">Ask your invoices</h2>
      <p className="text-xs text-muted-foreground">
        Questions about {orgName}&apos;s invoices.
      </p>
    </div>

    <div className="flex-1 overflow-y-auto text-sm text-muted-foreground">
      Not implemented yet.
    </div>

    <form className="flex items-end gap-2">
      <textarea
        data-testid="chat-input"
        rows={2}
        disabled
        placeholder="How many overdue invoices do we have?"
        className="flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm"
      />
      <Button type="submit" size="sm" disabled data-testid="chat-send">
        <Send className="size-4" />
        Send
      </Button>
    </form>
  </div>
);
