const DetailPage = async (_props: PageProps<'/invoices/[id]'>) => {
  // TODO(L2) — async @detail: await params, getInvoice(id), notFound() on null, render <InvoiceDetail>
  return (
    <section className="p-6 text-sm text-muted-foreground">Detail slot</section>
  );
};

export default DetailPage;
