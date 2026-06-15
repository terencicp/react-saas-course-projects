import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { Pagination } from '@/app/(app)/customers/pagination';
import { CustomersTable } from '@/app/(app)/customers/table';
import { CustomersToolbar } from '@/app/(app)/customers/toolbar';
import { Button } from '@/components/ui/button';
import { listCustomers } from '@/lib/customers/queries';
import { customerListSearchParamsCache } from '@/lib/customers/search-params';
import { getSession } from '@/server/session';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const CustomersPage = async ({ searchParams }: PageProps) => {
  const parsed = await customerListSearchParamsCache.parse(searchParams);
  const session = await getSession();

  const { rows, nextCursor } = listCustomers({
    orgId: session.orgId,
    q: parsed.q,
    cursor: parsed.cursor,
  });

  return (
    <div data-testid="customers-page" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button asChild size="sm">
          <Link href="/customers/new/step-1">New customer</Link>
        </Button>
      </div>

      <CustomersToolbar q={parsed.q} />
      <CustomersTable rows={rows} />
      <Pagination cursor={parsed.cursor} nextCursor={nextCursor} />
    </div>
  );
};

export default CustomersPage;
