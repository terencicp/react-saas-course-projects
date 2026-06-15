import { Body, Html, Tailwind, Text } from 'react-email';

import { emailTailwindConfig } from './email-tailwind-config';

export type WelcomeEmailProps = {
  firstName: string;
  verifyUrl: string;
};

// TODO(L4) — build the welcome template: EmailLayout, Preview, Heading/Text/Button, dark-mode head meta, alternate text link.
const WelcomeEmail = (_props: WelcomeEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html>
      <Body>
        <Text>Welcome email — TODO(L4)</Text>
      </Body>
    </Html>
  </Tailwind>
);

WelcomeEmail.PreviewProps = {
  firstName: 'Ada',
  verifyUrl: 'https://acme.example/verify/abc-123',
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
