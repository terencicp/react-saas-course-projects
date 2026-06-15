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

export type ExportReadyEmailProps = {
  orgName: string;
  rowCount: number;
  downloadUrl: string;
};

// The export-ready notification. The sendExportEmail child task renders this with
// the org name, the row count, and the download link (a placeholder
// https://example.com/exports/{runId}.csv until Chapter 069 wires the real upload URL).
// Siblings import via same-folder relative paths — never the @/ alias — because the
// React Email preview server resolves modules from its own working dir.
const ExportReadyEmail = ({
  orgName,
  rowCount,
  downloadUrl,
}: ExportReadyEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang="en" dir="auto">
      <Head>
        <title>{`Your ${APP_NAME} export is ready`}</title>
        <meta name="color-scheme" content="light dark" />
      </Head>
      <Preview>Your invoice export is ready to download</Preview>
      <Body className="bg-zinc-50">
        <EmailLayout>
          <Section className="px-6 py-4">
            <Heading as="h1">Your export is ready</Heading>
            <Text>
              The invoice export for {orgName} finished — {rowCount} rows are
              ready to download.
            </Text>
            <Button
              href={downloadUrl}
              className="rounded-md bg-brand px-5 py-3 text-brand-foreground"
            >
              Download CSV
            </Button>
            <Text className="text-[12px] text-muted">
              Or paste this link into your browser: {downloadUrl}
            </Text>
          </Section>
        </EmailLayout>
      </Body>
    </Html>
  </Tailwind>
);

ExportReadyEmail.PreviewProps = {
  orgName: 'Acme',
  rowCount: 245,
  downloadUrl: 'https://example.com/exports/run_abc123.csv',
} satisfies ExportReadyEmailProps;

export default ExportReadyEmail;
