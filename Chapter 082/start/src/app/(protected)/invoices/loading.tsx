// Segment Suspense seam: the page reads requireOrgUser() + listInvoices(), which
// under Cache Components need a Suspense boundary or `next build` prerender fails.
const Loading = () => null;

export default Loading;
