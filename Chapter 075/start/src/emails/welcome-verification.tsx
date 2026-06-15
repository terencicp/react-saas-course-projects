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

export type WelcomeVerificationProps = {
  firstName: string;
  verifyUrl: string;
};

const WelcomeVerification = ({
  firstName,
  verifyUrl,
}: WelcomeVerificationProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Head>
        <title>{`Verify your ${APP_NAME} email`}</title>
        <meta name="color-scheme" content="light dark" />
      </Head>
      <Preview>Verify your email to finish signing up</Preview>
      <Body className="bg-zinc-50">
        <EmailLayout>
          <Section className="px-6 py-4">
            <Heading as="h1">Verify your email</Heading>
            <Text>
              Hi {firstName}, confirm this address to finish setting up your
              account.
            </Text>
            <Button
              href={verifyUrl}
              className="rounded-md bg-brand px-5 py-3 text-brand-foreground"
            >
              Verify email
            </Button>
            <Text className="text-[12px] text-muted">
              Or paste this link into your browser: {verifyUrl}
            </Text>
            <Text className="text-[12px] text-muted">
              This link expires in 1 hour.
            </Text>
          </Section>
        </EmailLayout>
      </Body>
    </Html>
  </Tailwind>
);

WelcomeVerification.PreviewProps = {
  firstName: 'Ada',
  verifyUrl: 'https://acme.example/verify/abc-123',
} satisfies WelcomeVerificationProps;

export default WelcomeVerification;
