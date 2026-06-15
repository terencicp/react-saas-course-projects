const InvoicesLayout = ({
  children,
  list,
  detail,
}: LayoutProps<'/invoices'>) => (
  <div className="flex min-h-dvh flex-col">
    {children}
    <div
      data-testid="invoices-grid"
      className="grid flex-1 md:grid-cols-[20rem_1fr]"
    >
      {list}
      {detail}
    </div>
  </div>
);

export default InvoicesLayout;
