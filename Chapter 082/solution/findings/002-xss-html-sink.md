# Finding 002 — Unsanitized user content rendered through dangerouslySetInnerHTML on invoice notes

**Category:** XSS sinks (error discipline + security headers).
**Severity:** critical — a stored XSS sink on user-controlled content reachable in every organization's invoice notes, with no sanitization at the seam and no CSP backstop, so any tenant can plant script that runs in another reader's authenticated session.

## Rule

Rendered content is operator-trustworthy or it is not, and user-submitted content is never operator-trustworthy without sanitization: the user-message-vs-operator-record split (chapter 080, lesson 2 — what reaches the browser as live markup is an operator artifact and must be sanitized before it crosses the seam) meets the header baseline (chapter 081, lesson 1 — CSP is the only header that blocks live attacks, XSS first), and the two combine to the single rule that a `dangerouslySetInnerHTML` sink fed by user input is a defect on its face.

## Location

`src/app/(protected)/invoices/[id]/notes.tsx`:

- `InvoiceNotes` — the notes-list component (lines 18–43); the sink is the `dangerouslySetInnerHTML={{ __html: note.body }}` at line 37, inside the `data-testid="invoice-note-body"` wrapper at lines 34–38. `note.body` is the free-text column a user typed (`src/db/schema.ts`, `invoiceNotes.body`, line 152 — `text().notNull()`, no transform on write).

How it surfaced — open the running app, open the source, and let one command name the suspect:

```
# 1. Every HTML-injection sink in the tree.
rg -n "dangerouslySetInnerHTML" src
```

The grep returns exactly one hit, `notes.tsx:37`. There is a second, non-finding signal worth recording so the discipline is named, not just the hit: the same line carries a `// biome-ignore lint/security/noDangerouslySetInnerHtml` directive (line 36). The directive is **not** a fix and does not retire the finding — Biome's recommended rule already flagged this exact sink, and the ignore only silences the gate so the seeded target ships green; the sink itself is unchanged. A directive that suppresses a security lint over user input is a tell, not a clearance.

Running-app confirmation (the fingerprint a senior catches on the rendered DOM): navigate to `/invoices/<seeded-id>` as the seeded admin. The planted note's body, `Customer asked us to mark this <b>bold</b> — follow up next week.` (`scripts/seed.ts`, `SEED_NOTE`, line 205), renders the word **bold** as a live `<b>` element inside `invoice-note-body`, not as the escaped text `&lt;b&gt;bold&lt;/b&gt;`. The markup the user stored is executing in the reader's page. `<b>` is the tame proof; the same path renders `<img src=x onerror=…>` or `<script>` with identical trust.

## Consequence

Any user who can write an invoice note can store live HTML, and that HTML runs in the page of anyone who later opens the invoice — across organizations, since the column is shared free text with no per-tenant trust boundary on its content. An attacker plants a note whose body carries a script that reads the victim's session, exfiltrates the invoice data they can see, fires authenticated mutations as them (changing billing, transferring ownership), or rewrites the page to phish their password. The victim sees an ordinary invoice; nothing on screen warns them. This is stored XSS — the worst shape, because it persists and fires for every reader without the attacker being present — and it is reachable today on a route the app links to.

## Fix

Sanitize at write **and** at read, and store the sanitized output, with `DOMPurify` as the named tool (Code conventions: any `dangerouslySetInnerHTML` input passes through `DOMPurify`, and the default is to refuse the input). The seam is the note's write path and its render path, not the component's call site:

```ts
// On write (the create-note Server Action): sanitize, store the safe form.
const clean = DOMPurify.sanitize(input.body, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'] });
await tx.insert(invoiceNotes).values({ ...input, body: clean });

// On read (notes.tsx): sanitize again before the sink.
<div data-testid="invoice-note-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.body) }} />
```

Sanitizing at write alone is the partial answer the audit must reject: it leaves the **historical-data vector** open — every note already in the table was written before the sanitizer existed and ships raw to the reader, so the only safe posture is sanitize-at-read as well (with a one-time backfill pass that rewrites existing rows through `DOMPurify`). The honest minimum is to allow no tags at all and render notes as escaped plain text — the senior reach only widens to an allow-list of inline formatting if the product genuinely needs rich notes.

A strict CSP (finding 4 — the missing `Content-Security-Policy` with a per-request nonce and `'strict-dynamic'`) is the complementary defense-in-depth layer that would neuter an injected `<script>` even if a sink slipped through. It is **not** a substitute for sanitizing this sink: CSP is a backstop, the sanitizer is the gate, and a launch needs both. The two findings are one threat model split into the sink (here) and its missing backstop (finding 4); each is scored on its own.

Recognition-only — the adjacent sink shapes the same eye should sweep for once it has found one (none are seeded here, so none is a separate finding): `eval`, `new Function`, `setTimeout`/`setInterval` called with a string body, and direct DOM `el.innerHTML = …` assignments. A `dangerouslySetInnerHTML` hit is the React-shaped member of that family; the audit checklist (finding SUMMARY) carries all of them.
