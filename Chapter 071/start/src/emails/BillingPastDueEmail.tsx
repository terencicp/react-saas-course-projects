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

// The notification email for org.billing.past_due. This event carries
// criticalChannel:'email' in the registry, so it flows even when the user toggled
// billing email off. Typed payload; no unsubscribe footer (transactional + critical).
export type BillingPastDueEmailProps = {
  orgName: string;
  plan: string;
};

const BillingPastDueEmail = ({ orgName, plan }: BillingPastDueEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Head>
        <title>{`Payment past due for ${orgName} on ${APP_NAME}`}</title>
        <meta name="color-scheme" content="light dark" />
      </Head>
      <Preview>{`Your ${orgName} subscription payment is past due`}</Preview>
      <Body className="bg-zinc-50">
        <EmailLayout>
          <Section className="px-6 py-4">
            <Heading as="h1">Payment past due</Heading>
            <Text>
              The latest payment for {orgName}'s {plan} plan did not go through.
              Update your payment method to keep your subscription active.
            </Text>
          </Section>
        </EmailLayout>
      </Body>
    </Html>
  </Tailwind>
);

BillingPastDueEmail.PreviewProps = {
  orgName: 'Acme',
  plan: 'pro',
} satisfies BillingPastDueEmailProps;

export default BillingPastDueEmail;
