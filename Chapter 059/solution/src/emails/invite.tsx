import {
  Body,
  Button,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from 'react-email';

import { EmailLayout } from './components/email-layout';
import { emailTailwindConfig } from './email-tailwind-config';

const APP_NAME = 'Acme';

export type InviteEmailProps = {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
};

const InviteEmail = ({
  orgName,
  inviterName,
  role,
  acceptUrl,
  expiresAt,
}: InviteEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Head>
        <title>{`You're invited to ${orgName} on ${APP_NAME}`}</title>
        <meta name="color-scheme" content="light dark" />
      </Head>
      <Preview>{`${inviterName} invited you to join ${orgName}`}</Preview>
      <Body className="bg-zinc-50">
        <EmailLayout>
          <Section className="px-6 py-4">
            <Heading as="h1">Join {orgName}</Heading>
            <Text>
              {inviterName} invited you to join {orgName} as a {role}.
            </Text>
            <Button
              href={acceptUrl}
              className="rounded-md bg-brand px-5 py-3 text-brand-foreground"
            >
              Accept invitation
            </Button>
            <Text className="text-[12px] text-muted">
              Or paste this link into your browser: {acceptUrl}
            </Text>
            <Text className="text-[12px] text-muted">
              This invitation expires on {expiresAt.toUTCString()}.
            </Text>
          </Section>
        </EmailLayout>
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
