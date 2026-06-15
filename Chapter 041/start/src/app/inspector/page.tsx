import { CountsBanner } from '@/app/inspector/_components/counts-banner';
import { DetailPanel } from '@/app/inspector/_components/detail-panel';
import { InspectorHeader } from '@/app/inspector/_components/inspector-header';
import { ListPanel } from '@/app/inspector/_components/list-panel';
import { PlanPanel } from '@/app/inspector/_components/plan-panel';
import { decodeCursor } from '@/db/cursor';
import { listOrgs } from '@/lib/invoices/counts';
import { statusSchema } from '@/lib/invoices/schema';

const InspectorPage = async ({ searchParams }: PageProps<'/inspector'>) => {
  const params = await searchParams;

  const orgs = await listOrgs();

  // Default to the first seeded org so the page is useful on first load. With no
  // orgs (an unseeded DB) the panels render their empty states rather than 500.
  const orgIdParam =
    typeof params.orgId === 'string' ? params.orgId : undefined;
  const organizationId = orgIdParam ?? orgs[0]?.id ?? '';

  const statusParsed = statusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;

  const cursorToken = typeof params.cursor === 'string' ? params.cursor : null;
  const cursor = cursorToken
    ? (decodeCursor(cursorToken) ?? undefined)
    : undefined;

  const invoiceId =
    typeof params.invoiceId === 'string' ? params.invoiceId : undefined;

  return (
    <main
      data-testid="inspector"
      className="mx-auto flex max-w-6xl flex-col gap-6 p-6"
    >
      <CountsBanner />

      <InspectorHeader
        orgs={orgs}
        activeOrgId={organizationId}
        activeStatus={status}
      />

      <div
        data-testid="inspector-grid"
        className="grid gap-6 md:grid-cols-[1fr_1fr]"
      >
        <ListPanel
          organizationId={organizationId}
          status={status}
          cursor={cursor}
        />
        <DetailPanel organizationId={organizationId} invoiceId={invoiceId} />
      </div>

      <PlanPanel
        organizationId={organizationId}
        status={status}
        invoiceId={invoiceId}
      />
    </main>
  );
};

export default InspectorPage;
