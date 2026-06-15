import { notFound } from 'next/navigation';
import { CommentThread } from '@/app/(app)/invoices/[id]/comment-thread';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getInvoiceDetail } from '@/lib/invoices/queries';
import { getSession } from '@/server/session';
import { findUser } from '@/server/store';

// TODO(L2) — prefetch + dehydrate + HydrationBoundary
//
// Above the render, seed the cache with the in-process read:
//   const queryClient = getQueryClient();
//   await queryClient.prefetchInfiniteQuery({
//     queryKey: commentKeys.lists(id),
//     queryFn: ({ pageParam }) => listCommentsPage({ orgId: session.orgId,
//       invoiceId: id, cursor: pageParam, pageSize: 20 }),
//     initialPageParam: null as string | null });
// then wrap ONLY the thread subtree in
// `<HydrationBoundary state={dehydrate(queryClient)}>` (the prefetch key must
// equal the hook's `commentKeys.lists(id)` or hydration silently misses).

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
        <CommentThread
          invoiceId={invoice.id}
          session={{ userId: session.userId, userName }}
        />
      </section>
    </div>
  );
};

export default InvoiceDetailPage;
