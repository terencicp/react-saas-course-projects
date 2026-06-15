import type { InvoiceNote } from '@/db/schema';

// The invoice-notes region. XSS-safe (082 finding 2, pre-fixed): the user-submitted
// `body` is rendered as escaped plain text — React escapes it by default — so the
// dangerouslySetInnerHTML sink is gone entirely, and so is the Biome security
// suppression the seeded defect needed to ship green. This is the honest minimum the
// finding names (allow no tags, render notes as escaped text); the historical-data
// vector is closed because nothing is interpreted as live markup.
export const InvoiceNotes = ({ notes }: { notes: InvoiceNote[] }) => {
  if (notes.length === 0) {
    return (
      <p
        data-testid="invoice-notes-empty"
        className="text-sm text-muted-foreground"
      >
        No notes yet.
      </p>
    );
  }

  return (
    <ul data-testid="invoice-notes" className="space-y-3">
      {notes.map((note) => (
        <li key={note.id} className="rounded-md border p-3 text-sm">
          <div data-testid="invoice-note-body">{note.body}</div>
        </li>
      ))}
    </ul>
  );
};
