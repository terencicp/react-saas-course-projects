const InterceptedNewPage = () => {
  // TODO(L3) — intercepting modal: <InvoiceForm /> inside <Dialog> closing via router.back()
  return (
    <section className="p-6 text-sm text-muted-foreground">
      Intercepted new invoice
    </section>
  );
};

export default InterceptedNewPage;
