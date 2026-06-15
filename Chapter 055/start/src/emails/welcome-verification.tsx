import { Body, Html, Tailwind, Text } from 'react-email';

import { emailTailwindConfig } from './email-tailwind-config';

export type WelcomeVerificationProps = {
  firstName: string;
  verifyUrl: string;
};

// TODO(L2) — build the verification template: EmailLayout, Preview, Heading/greeting/Button(verifyUrl), plain-text fallback, 1-hour expiry line.
const WelcomeVerification = (_props: WelcomeVerificationProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html>
      <Body>
        <Text>Verify email — TODO(L2)</Text>
      </Body>
    </Html>
  </Tailwind>
);

WelcomeVerification.PreviewProps = {
  firstName: 'Ada',
  verifyUrl: 'https://acme.example/verify/abc-123',
} satisfies WelcomeVerificationProps;

export default WelcomeVerification;
