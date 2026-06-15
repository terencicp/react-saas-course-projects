import { Button } from '@/components/ui/button';
import { statusSchema } from '@/lib/invoices/schema';

const statuses = statusSchema.options;

export const InvoiceForm = () => (
  <form data-testid="invoice-form" className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">
      <label htmlFor="number" className="text-sm font-medium">
        Number
      </label>
      <input
        id="number"
        name="number"
        type="text"
        placeholder="INV-2026-031"
        className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>

    <div className="flex flex-col gap-2">
      <label htmlFor="customer" className="text-sm font-medium">
        Customer
      </label>
      <input
        id="customer"
        name="customer"
        type="text"
        placeholder="Northwind Traders"
        className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>

    <div className="flex flex-col gap-2">
      <label htmlFor="amount" className="text-sm font-medium">
        Amount
      </label>
      <input
        id="amount"
        name="amount"
        type="number"
        min="0"
        step="0.01"
        placeholder="0.00"
        className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>

    <div className="flex flex-col gap-2">
      <label htmlFor="status" className="text-sm font-medium">
        Status
      </label>
      <select
        id="status"
        name="status"
        defaultValue="draft"
        className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>

    <div className="flex flex-col gap-2">
      <label htmlFor="dueDate" className="text-sm font-medium">
        Due date
      </label>
      <input
        id="dueDate"
        name="dueDate"
        type="date"
        className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>

    {/* Render-only: wiring the submit (Server Action + validation) lands in Unit 6. */}
    <Button type="submit" className="self-start">
      Create invoice
    </Button>
  </form>
);
