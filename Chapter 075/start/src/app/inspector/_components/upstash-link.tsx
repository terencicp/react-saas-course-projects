// A deep link to the project's Upstash console. The REST URL is
// https://<db-name>.upstash.io; the console lives at console.upstash.com. We link to
// the console root (the precise DB deep-link needs the DB id, not in the REST URL).
// One element.
const consoleUrl = 'https://console.upstash.com/ratelimit';

export const UpstashLink = () => (
  <a
    data-testid="upstash-link"
    href={consoleUrl}
    target="_blank"
    rel="noreferrer"
    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
  >
    Open the Upstash console
  </a>
);
