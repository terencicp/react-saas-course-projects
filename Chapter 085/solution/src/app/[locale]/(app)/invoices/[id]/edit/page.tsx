import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { EditForm } from '@/app/[locale]/(app)/invoices/[id]/edit/edit-form';
import { routing } from '@/i18n/routing';
import { getInvoiceDetail, toInvoiceRow } from '@/lib/invoices/queries';
import { getSession } from '@/server/session';
import { invoices } from '@/server/store';

// Enumerate (locale, id) so each edit route is a concrete static path. Once
// `[locale]/layout.tsx` ships `generateStaticParams`, Next prerenders every
// locale route — including this one. As a fallback (`[id]` un-enumerated) the
// shared `(app)/layout.tsx` chrome's locale-aware `Link`/switcher resolve the
// path dynamically, which fails the static prerender under Cache Components;
// enumerating the seeded ids makes the chrome a static shell while the
// cookie-reading page body streams behind `loading.tsx`.
export const generateStaticParams = () =>
  routing.locales.flatMap((locale) =>
    invoices.map((invoice) => ({ locale, id: invoice.id })),
  );

type EditPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

const EditInvoicePage = async ({ params }: EditPageProps) => {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await getSession();

  const invoice = getInvoiceDetail({
    orgId: session.orgId,
    id,
    role: session.role,
  });

  if (!invoice) {
    notFound();
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Edit {invoice.number}</h1>
      {/* Project to the serializable row: Temporal fields can't cross to the
          client form. */}
      <EditForm invoice={toInvoiceRow(invoice)} role={session.role} />
    </div>
  );
};

export default EditInvoicePage;
