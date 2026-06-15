import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Harness setup ----------------------------------------------------------
//
// The send action transitively imports `@/lib/email`, which begins with
// `import 'server-only'`. That marker throws the moment it loads outside the
// React Server runtime, and Vitest's node env is not that runtime — so we
// replace it with an empty module before any of the student's code loads.
vi.mock('server-only', () => ({}));

// The env boundary (`@/env`) reads `process.env` at module-load time and refuses
// to boot when a variable is missing. Vitest does not auto-load `.env`, so we
// load it here before importing anything that reaches the env. This must run
// before the dynamic imports below.
process.loadEnvFile(new URL('../../.env', import.meta.url));

// We never want this suite to touch the DB or perform a real network send. The
// action depends on two seams we own here:
//   - `getActiveContext()` (identity) — stubbed to a fixed userId, no DB hit.
//   - `sendEmail()` (the wrapper) — stubbed so we can observe exactly what the
//     action passes it and control what it returns. No Resend call ever fires.
// We capture the calls in module-level holders the factory closes over.
const sendEmailCalls: Array<Record<string, unknown>> = [];
let sendEmailReturn: unknown = { ok: true, data: { id: 'resend-stub-id' } };

vi.mock('@/lib/auth-stub', () => ({
  getActiveContext: async () => ({
    organizationId: 'org-stub',
    userId: 'user-stub',
  }),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: async (input: Record<string, unknown>) => {
    sendEmailCalls.push(input);
    return sendEmailReturn;
  },
}));

// Public surface only: the action the inspector form fires, the email template
// the recipient sees, and react-email's render. No reaching into internals.
const { sendWelcomeEmail } = await import('@/app/actions/send-welcome');
const WelcomeEmail = (await import('@/emails/welcome')).default;
const { render } = await import('react-email');

// Build a FormData the way the inspector form posts it.
const formData = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [name, value] of Object.entries(fields)) fd.append(name, value);
  return fd;
};

beforeEach(() => {
  sendEmailCalls.length = 0;
  sendEmailReturn = { ok: true, data: { id: 'resend-stub-id' } };
});

afterEach(() => {
  vi.clearAllMocks();
});

// Requirement 1 — valid input keys the send idempotently, routes it through the
// wrapper exactly once, and returns the wrapper's ok Result unchanged.
describe('valid input routes one keyed send through the wrapper', () => {
  it('calls sendEmail once with an idempotency key and returns its ok Result', async () => {
    sendEmailReturn = { ok: true, data: { id: 'resend-abc-123' } };

    const result = await sendWelcomeEmail(
      null,
      formData({ recipientEmail: 'new-user@example.com', firstName: 'Ada' }),
    );

    expect(
      sendEmailCalls.length,
      `The action must funnel the send through the sendEmail wrapper exactly once — it called it ${sendEmailCalls.length} times. Check the action reaches the final seam (return await sendEmail({...})) for valid input.`,
    ).toBe(1);

    const sent = sendEmailCalls[0];
    if (sent === undefined) throw new Error('sendEmail was never called.');
    expect(
      typeof sent.idempotencyKey === 'string' && sent.idempotencyKey.length > 0,
      'sendEmail must be called with a non-empty idempotencyKey — without it repeated clicks would each send a fresh email. Derive idempotencyKey from userId + recipient and pass it through.',
    ).toBe(true);

    expect(
      result,
      "The action is a thin orchestrator: it must return the wrapper's Result unchanged. The ok({ id }) from sendEmail came back re-shaped or replaced.",
    ).toEqual({ ok: true, data: { id: 'resend-abc-123' } });
  });
});

// Requirement 2 — the key is stable per (user, recipient) and ignores firstName;
// it also normalizes the recipient (lowercase), so two clicks collapse to one
// send even when the name changes or the casing differs. (z.email() rejects
// surrounding whitespace at parse, so casing is the variation we can drive
// through the action end-to-end.)
describe('idempotency key is one welcome per user per recipient', () => {
  it('produces the same key across a changed firstName and mixed-case recipient', async () => {
    await sendWelcomeEmail(
      null,
      formData({ recipientEmail: 'reader@example.com', firstName: 'Ada' }),
    );
    await sendWelcomeEmail(
      null,
      // Same person: different name, different casing.
      formData({
        recipientEmail: 'Reader@Example.COM',
        firstName: 'Grace',
      }),
    );

    expect(
      sendEmailCalls.length,
      'Both valid clicks should reach the wrapper so their keys can be compared — one of them did not. Make sure parse accepts a mixed-case address and the action proceeds to sendEmail.',
    ).toBe(2);
    const [first, second] = sendEmailCalls;
    if (first === undefined || second === undefined) {
      throw new Error('Expected sendEmail to be called twice.');
    }

    expect(
      first.idempotencyKey,
      'Two clicks for the same recipient — even with a changed firstName and different casing — must produce one identical idempotency key (one welcome per user per recipient). The key must be built from the userId + the normalized (lowercased) recipient, and must NOT include firstName.',
    ).toBe(second.idempotencyKey);
  });
});

// Requirement 3 — missing fields short-circuit at parse with a validation Result
// carrying the per-field errors from z.flattenError, before the wrapper is reached.
describe('missing fields return a validation Result with field errors', () => {
  it('flags recipientEmail when it is empty', async () => {
    const result = await sendWelcomeEmail(
      null,
      formData({ recipientEmail: '', firstName: 'Ada' }),
    );

    expect(
      result.ok,
      'An empty recipientEmail must fail parsing before anything else — the action returned ok instead of a validation failure.',
    ).toBe(false);
    if (result.ok) return;

    expect(
      result.error.code,
      `Invalid input must return err('validation', …) — got code '${result.error.code}'. Parse with the schema first and return err('validation', …, z.flattenError(parsed.error).fieldErrors) on failure.`,
    ).toBe('validation');
    expect(
      result.error.fieldErrors?.recipientEmail,
      'A validation failure must carry per-field errors so the form can highlight the bad input. fieldErrors.recipientEmail was missing — pass z.flattenError(parsed.error).fieldErrors as the third err() argument.',
    ).toBeTruthy();

    expect(
      sendEmailCalls.length,
      'The action must parse before it sends: invalid input must never reach the sendEmail wrapper, but it did.',
    ).toBe(0);
  });

  it('flags firstName when it is empty', async () => {
    const result = await sendWelcomeEmail(
      null,
      formData({ recipientEmail: 'reader@example.com', firstName: '' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('validation');
    expect(
      result.error.fieldErrors?.firstName,
      'An empty firstName must produce fieldErrors.firstName (the schema requires a non-empty name) — it was missing.',
    ).toBeTruthy();
  });
});

// Requirement 4 — the action returns the wrapper's failure Result verbatim. A
// suppression hit comes back as err('forbidden', …) and must NOT be re-shaped
// (e.g. into 'validation' or 'internal'); the wrapper owns the failure taxonomy.
describe('the wrapper failure Result is returned unchanged', () => {
  it("passes a 'forbidden' suppression failure straight back", async () => {
    sendEmailReturn = {
      ok: false,
      error: {
        code: 'forbidden',
        userMessage: 'This recipient is on the suppression list.',
      },
    };

    const result = await sendWelcomeEmail(
      null,
      formData({
        recipientEmail: 'suppressed@send.acme.example',
        firstName: 'Ada',
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.error.code,
      `The action must return the wrapper's Result unchanged — a 'forbidden' suppression failure came back as '${result.error.code}'. Do not catch or re-map sendEmail's result; just \`return await sendEmail(...)\`. The inspector branches on code === 'forbidden' to show the suppression card.`,
    ).toBe('forbidden');
    expect(result.error.userMessage).toBe(
      'This recipient is on the suppression list.',
    );
  });
});

// Requirement 5 — the rendered HTML carries the preheader, the compiled Tailwind
// styles, the dark-mode head meta, and the verifyUrl on the button href.
describe('the template renders the expected HTML surface', () => {
  it('carries the preheader, dark-mode meta, compiled Tailwind, and the verify link', async () => {
    const props = WelcomeEmail.PreviewProps;
    const html = await render(createElement(WelcomeEmail, props));

    expect(
      html.includes('color-scheme'),
      'The dark-mode <head> meta is missing — add <meta name="color-scheme" …> and <meta name="supported-color-schemes" …> so clients honour the recipient\'s dark mode.',
    ).toBe(true);
    expect(
      /supported-color-schemes/.test(html),
      'The supported-color-schemes meta is missing from <Head> — dark-mode clients need it alongside color-scheme.',
    ).toBe(true);

    expect(
      html.includes(props.verifyUrl),
      'The verifyUrl prop must reach the CTA button href so the recipient can verify — it was not found in the rendered HTML. The template is a pure renderer: it must use the verifyUrl prop, not build its own link.',
    ).toBe(true);

    // The <Preview> preheader renders as inline hidden text near the top.
    expect(
      /verify your email/i.test(html),
      'The <Preview> preheader text is missing — add a <Preview> with the welcome/verify summary line that shows in the inbox list.',
    ).toBe(true);

    // <Tailwind> compiles utility classes to inline styles; a raw class like
    // "bg-brand" surviving as a class name means the styles never compiled.
    expect(
      html.includes('style='),
      'The compiled <Tailwind> styles are missing — the template must be wrapped in <Tailwind config={…}> so utility classes inline as styles for email clients.',
    ).toBe(true);
  });
});

// Requirement 6 — the plain-text rendering stands on its own: the heading, the
// welcome paragraph, and the verify URL all survive into the text/plain part.
describe('the plain-text rendering stands alone', () => {
  it('carries the heading, the welcome copy, and the verify URL', async () => {
    const props = WelcomeEmail.PreviewProps;
    const text = await render(createElement(WelcomeEmail, props), {
      plainText: true,
    });

    // The plain-text renderer may upper-case headings, so match the greeting
    // case-insensitively (e.g. "Welcome, Ada" → "WELCOME, ADA").
    expect(
      new RegExp(`welcome,?\\s+${props.firstName}`, 'i').test(text),
      'The plain-text part must include the heading greeting (e.g. "Welcome, Ada") — the firstName prop did not survive into the text rendering. The <Heading> must read "Welcome, {firstName}".',
    ).toBe(true);
    expect(
      /welcome/i.test(text) && /sign(ed|ing) up|confirm|verify/i.test(text),
      'The plain-text part must carry the welcome paragraph so the message reads on its own without HTML — the body copy is missing.',
    ).toBe(true);
    expect(
      text.includes(props.verifyUrl),
      'The verify URL must appear in the plain-text part — echo verifyUrl in an alternate-link <Text> so the CTA survives when the button is stripped.',
    ).toBe(true);
  });
});
