import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { CommentThread } from '@/app/(app)/invoices/[id]/comment-thread';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { commentKeys } from '@/lib/comments/keys';
import { listCommentsPage } from '@/lib/comments/queries';
import { getInvoiceDetail } from '@/lib/invoices/queries';
import { getQueryClient } from '@/lib/query-client';
import { getSession } from '@/server/session';
import { findUser } from '@/server/store';

type DetailPageProps = {
  params: Promise<{ id: string }>;
};

const InvoiceDetailPage = async ({ params }: DetailPageProps) => {
  const { id } = await params;
  const session = await getSession();

  const invoice = getInvoiceDetail({
    orgId: session.orgId,
    id,
    role: session.role,
  });

  if (!invoice) {
    notFound();
  }

  const userName = findUser(session.userId)?.name ?? session.userId;

  // The page is a Server Component, so it reads the store in-process (no client
  // fetcher, no route handler round-trip) to seed the cache. The thread's
  // `useInfiniteQuery` reads this hydrated first page and never shows a loading
  // state on first paint. Key MUST equal the hook's `commentKeys.lists(id)`.
  const queryClient = getQueryClient();
  await queryClient.prefetchInfiniteQuery({
    queryKey: commentKeys.lists(id),
    queryFn: ({ pageParam }) =>
      listCommentsPage({
        orgId: session.orgId,
        invoiceId: id,
        cursor: pageParam,
        pageSize: 20,
      }),
    initialPageParam: null as string | null,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{invoice.number}</h1>
        <span className="text-sm capitalize text-muted-foreground">
          {invoice.status}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{invoice.customerName}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total</CardTitle>
          </CardHeader>
          <CardContent className="text-sm tabular-nums">
            {invoice.currency} {invoice.total}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-medium">Comments</h2>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <CommentThread
            invoiceId={invoice.id}
            session={{ userId: session.userId, userName }}
          />
        </HydrationBoundary>
      </section>
    </div>
  );
};

export default InvoiceDetailPage;
