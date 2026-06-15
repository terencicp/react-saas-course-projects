import type { InvoiceNote } from '@/db/schema';

// The invoice-notes region.
//
// SEEDED AUDIT DEFECT #2 (finding 2) — dangerouslySetInnerHTML on user content
// (080 L2 + 081 L1): each note's user-submitted `body` is rendered through
// dangerouslySetInnerHTML with NO sanitization. The seed plants a note whose body
// contains `<b>bold</b>`, so the running app renders it as LIVE bold HTML (the
// visible fingerprint) — stored XSS reachable in any org's invoice notes. The
// healthy shape sanitizes at write AND read (DOMPurify) and a strict CSP (finding 4)
// backstops it. The target ships the bug on purpose; do not "fix" it here.
//
// The biome-ignore below is MANDATORY, not a fix: biome's
// lint/security/noDangerouslySetInnerHtml rule is default-on, so `biome ci` (the
// first gate in `pnpm verify`) would exit non-zero without it. The directive
// silences the linter so the seeded defect can ship green; the sink itself is
// unchanged and finding 2's grep for `dangerouslySetInnerHTML` still hits.
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
          <div
            data-testid="invoice-note-body"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: deliberately seeded audit defect #2 (unsanitized user content) — the target ships this bug on purpose; the fix is documented in findings/002-xss-html-sink.md, not applied here.
            dangerouslySetInnerHTML={{ __html: note.body }}
          />
        </li>
      ))}
    </ul>
  );
};
