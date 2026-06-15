// Segment Suspense seam: the page reads requireOrgUser() + getInvoiceWithNotes(),
// which under Cache Components need a Suspense boundary or `next build` prerender
// fails.
const Loading = () => null;

export default Loading;
