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

// The notification email for org.invitation.sent. Declares its own typed payload — the
// registry's permissive `(props: any) => ReactElement` template field accepts it, and
// the email channel calls it with the rendered emailProps. No unsubscribe link/footer:
// transactional notifications do not carry one-click unsubscribe (only promotional bulk
// email does); opt-out is the per-category preference toggle.
export type InviteSentEmailProps = {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  invitedEmail: string;
};

const InviteSentEmail = ({
  orgName,
  inviterName,
  role,
  acceptUrl,
}: InviteSentEmailProps) => (
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
          </Section>
        </EmailLayout>
      </Body>
    </Html>
  </Tailwind>
);

InviteSentEmail.PreviewProps = {
  orgName: 'Acme',
  inviterName: 'Alice',
  role: 'member',
  acceptUrl: 'https://acme.example/accept-invite?id=abc&token=xyz&sig=sig',
  invitedEmail: 'newcomer@acme.test',
} satisfies InviteSentEmailProps;

export default InviteSentEmail;
