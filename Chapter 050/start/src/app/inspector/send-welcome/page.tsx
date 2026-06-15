import { render } from 'react-email';

import { SendWelcomeForm } from '@/app/inspector/send-welcome/send-welcome-form';
import WelcomeEmail from '@/emails/welcome';

// Server component. It reads NO request-time DB/network data in its body — the
// preview iframe is built from static PreviewProps — so no loading.tsx/Suspense
// seam is required. `render()` returns the template's HTML string, which the
// iframe shows via srcDoc (a sandboxed render that proves the props-only
// template renders identically here, in the preview server, and in a real send).
const SendWelcomePage = async () => {
  const previewHtml = await render(
    <WelcomeEmail {...WelcomeEmail.PreviewProps} />,
  );

  return (
    <main
      data-testid="inspector-page"
      className="mx-auto flex max-w-5xl flex-col gap-8 p-8"
    >
      <h1 className="text-2xl font-semibold">Welcome email inspector</h1>
      <div className="grid gap-8 md:grid-cols-2">
        <SendWelcomeForm />
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Email preview</h2>
          <iframe
            srcDoc={previewHtml}
            data-testid="email-preview-frame"
            title="Welcome email preview"
            className="h-[600px] w-full rounded-md border bg-white"
          />
        </section>
      </div>
    </main>
  );
};

export default SendWelcomePage;
