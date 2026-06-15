import { Body, Html, Tailwind, Text } from 'react-email';

import { emailTailwindConfig } from './email-tailwind-config';

// TODO(L5) — build the invite template: EmailLayout, Preview, Heading/org/inviter/
// role/Button(acceptUrl), expiry line.
export type InviteEmailProps = {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
};

const InviteEmail = (_props: InviteEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Body className="bg-zinc-50">
        <Text>Invitation — TODO(L5)</Text>
      </Body>
    </Html>
  </Tailwind>
);

InviteEmail.PreviewProps = {
  orgName: 'Acme',
  inviterName: 'Ada Lovelace',
  role: 'member',
  acceptUrl: 'https://acme.example/accept-invite?id=abc&token=xyz&sig=sig',
  expiresAt: new Date('2026-06-15T00:00:00.000Z'),
} satisfies InviteEmailProps;

export default InviteEmail;
