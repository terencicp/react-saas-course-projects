import {
  Body,
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

// The notification email for org.member.role_changed. Typed payload; no unsubscribe
// footer (transactional). The registry calls it through the permissive template field.
export type RoleChangedEmailProps = {
  orgName: string;
  actorName: string;
  newRole: string;
  before: string;
};

const RoleChangedEmail = ({
  orgName,
  actorName,
  newRole,
  before,
}: RoleChangedEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Head>
        <title>{`Your role in ${orgName} changed on ${APP_NAME}`}</title>
        <meta name="color-scheme" content="light dark" />
      </Head>
      <Preview>{`Your role in ${orgName} is now ${newRole}`}</Preview>
      <Body className="bg-zinc-50">
        <EmailLayout>
          <Section className="px-6 py-4">
            <Heading as="h1">Your role changed</Heading>
            <Text>
              {actorName} changed your role in {orgName} from {before} to{' '}
              {newRole}.
            </Text>
          </Section>
        </EmailLayout>
      </Body>
    </Html>
  </Tailwind>
);

RoleChangedEmail.PreviewProps = {
  orgName: 'Acme',
  actorName: 'Alice',
  newRole: 'admin',
  before: 'member',
} satisfies RoleChangedEmailProps;

export default RoleChangedEmail;
