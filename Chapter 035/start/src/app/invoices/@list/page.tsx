const ListPage = async (_props: PageProps<'/invoices'>) => {
  // TODO(L2) — async @list: await+safeParse searchParams, listInvoices({ status }), render <InvoiceList> + <StatusFilter current={status} />
  return (
    <section className="border-border border-e p-4 text-sm text-muted-foreground">
      List slot
    </section>
  );
};

export default ListPage;
