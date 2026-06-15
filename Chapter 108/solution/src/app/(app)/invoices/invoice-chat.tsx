'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { InvoiceStatsCard } from '@/app/(app)/invoices/invoice-stats-card';
import { Button } from '@/components/ui/button';
import type { InvoiceUIMessage } from '@/lib/llm/tools';

type InvoiceChatProps = {
  orgName: string;
};

// The typed chat surface: text bubbles plus the getInvoiceStats stats card across
// its four tool-part states. The endpoint is set on the transport — @ai-sdk/react@2
// removed the top-level `api` option from `useChat`. The whole tool part is spread
// into InvoiceStatsCard so its discriminated `state`/`input`/`output` narrow inside
// the card; passing them as separate props loses the narrowing.
export const InvoiceChat = ({ orgName }: InvoiceChatProps) => {
  const { messages, sendMessage, status } = useChat<InvoiceUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: () => toast.error('Something went wrong. Try again.'),
  });
  const [input, setInput] = useState('');

  const inFlight = status === 'streaming' || status === 'submitted';

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight || input.trim() === '') {
      return;
    }
    sendMessage({ text: input });
    setInput('');
  };

  return (
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

      <div className="flex-1 space-y-3 overflow-y-auto text-sm">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
            {message.parts.map((part, index) => {
              const key = `${message.id}-${index}`;
              switch (part.type) {
                case 'text':
                  return (
                    <p key={key} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                case 'tool-getInvoiceStats':
                  return <InvoiceStatsCard key={key} {...part} />;
                default:
                  return null;
              }
            })}
          </div>
        ))}
        {status === 'submitted' && (
          <p className="text-xs text-muted-foreground">Thinking…</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <textarea
          data-testid="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={2}
          placeholder="How many overdue invoices do we have?"
          className="flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={inFlight}
          data-testid="chat-send"
        >
          <Send className="size-4" />
          Send
        </Button>
      </form>
    </div>
  );
};
