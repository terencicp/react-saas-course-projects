import { HttpResponse, http } from 'msw';

// The Resend network boundary. Resend's SDK uses `fetch`, which MSW intercepts cleanly,
// so this is the genuine taught network-boundary reflex: the handler records every
// POST /emails into resendCalls and returns a fake id. A test asserts on resendCalls
// (e.g. length 0 on the checkout path — no email fires there) instead of reaching into
// the email module. The captured body is read via request.clone() so the handler does
// not consume the stream Resend's SDK already read.
//
// resendCalls is reset in integration-setup.ts's afterEach so calls never leak between
// tests.

export type ResendCall = {
  to: string | string[];
  subject: string;
  html?: string;
};

export const resendCalls: ResendCall[] = [];

export const resendHandlers = [
  http.post('https://api.resend.com/emails', async ({ request }) => {
    const body = (await request.clone().json()) as {
      to: string | string[];
      subject: string;
      html?: string;
    };
    resendCalls.push({ to: body.to, subject: body.subject, html: body.html });
    return HttpResponse.json({ id: 'fake_resend_id' });
  }),
];
