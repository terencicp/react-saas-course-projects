# Finding 003 — No request correlation id; a log line and its Sentry event can't be joined

<!-- TODO(L4) — document the missing requestId: rule (092 L2), location (proxy.ts + logger.ts + absent request-context.ts), consequence (log/Sentry can't join), fix (AsyncLocalStorage + mixin + requestId joined as context in beforeSend, not a tag) -->

**Category:**
**Severity:**

## Rule

## Location

## Consequence

## Fix
