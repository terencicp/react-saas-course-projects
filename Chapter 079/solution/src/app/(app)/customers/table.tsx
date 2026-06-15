import type { Route } from 'next';
import Link from 'next/link';
import type { Customer } from '@/server/types';

export const CustomersTable = ({ rows }: { rows: Customer[] }) => (
  <table data-testid="customers-table" className="w-full text-sm">
    <thead className="text-left text-muted-foreground">
      <tr className="border-b">
        <th className="py-2 font-medium">Name</th>
        <th className="py-2 font-medium">Email</th>
        <th className="py-2 font-medium">City</th>
        <th className="py-2 text-right font-medium">Terms</th>
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 ? (
        <tr>
          <td className="py-4 text-muted-foreground" colSpan={4}>
            No customers yet.
          </td>
        </tr>
      ) : (
        rows.map((row) => (
          <tr key={row.id} data-testid="customer-row" className="border-b">
            <td className="py-2">
              <Link
                className="hover:underline"
                href={`/customers/${row.id}` as Route}
              >
                {row.firstName} {row.lastName}
              </Link>
            </td>
            <td className="py-2">{row.email}</td>
            <td className="py-2">{row.city}</td>
            <td className="py-2 text-right uppercase tabular-nums">
              {row.paymentTerms}
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
);
