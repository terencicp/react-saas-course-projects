import type { ReactNode } from 'react';
import { Container, Img, Section, Text } from 'react-email';

// Brand chrome only — header logo + footer legal line. This lives INSIDE <Body>
// and does NOT render <Html>/<Head>/<Tailwind>; the template wraps it with those.
//
// APP_URL / APP_NAME / the legal address are module-level literal constants, NOT
// process.env reads: the React Email preview server (`pnpm email`) runs templates
// in its own .react-email working dir where process.env.NEXT_PUBLIC_* is undefined
// and `@/` aliases may not resolve. Keeping chrome on literals keeps the
// layout pure and renders identically in the preview server and a real send.
//
// The copyright year is the literal `© 2026`, never `new Date().getFullYear()` —
// reading the clock in a server-rendered component breaks `next build` under
// Cache Components.
const APP_NAME = 'Acme';
const APP_URL = 'http://localhost:3000';
const LEGAL_ADDRESS =
  'Acme, Inc. · 123 Market Street · San Francisco, CA 94105';

export const EmailLayout = ({ children }: { children: ReactNode }) => (
  <>
    <Section className="px-6 py-5">
      <Img src={`${APP_URL}/logo.png`} width={120} height={32} alt={APP_NAME} />
    </Section>
    <Container className="mx-auto max-w-[600px]">{children}</Container>
    <Section className="px-6 py-5">
      <Text className="text-[12px] text-muted">{LEGAL_ADDRESS}</Text>
      <Text className="text-[12px] text-muted">© 2026 {APP_NAME}</Text>
    </Section>
  </>
);
