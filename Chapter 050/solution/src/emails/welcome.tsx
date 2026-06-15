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

export type WelcomeEmailProps = {
  firstName: string;
  verifyUrl: string;
};

const WelcomeEmail = ({ firstName, verifyUrl }: WelcomeEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Head>
        <title>{`Welcome to ${APP_NAME}`}</title>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{`:root { color-scheme: light dark; }`}</style>
      </Head>
      <Preview>Welcome to {APP_NAME} — verify your email</Preview>
      <Body className="bg-zinc-50">
        <EmailLayout>
          <Section className="px-6 py-4">
            <Heading as="h1">Welcome, {firstName}</Heading>
            <Text>
              Thanks for signing up for {APP_NAME}. Confirm your email address
              to finish setting up your account and unlock everything in your
              workspace.
            </Text>
            <Button
              href={verifyUrl}
              className="rounded-md bg-brand px-5 py-3 text-brand-foreground"
            >
              Verify your email
            </Button>
            <Text className="text-[12px] text-muted">
              If the button does not work, copy and paste this link into your
              browser: {verifyUrl}
            </Text>
          </Section>
        </EmailLayout>
      </Body>
    </Html>
  </Tailwind>
);

WelcomeEmail.PreviewProps = {
  firstName: 'Ada',
  verifyUrl: 'https://acme.example/verify/abc-123',
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
