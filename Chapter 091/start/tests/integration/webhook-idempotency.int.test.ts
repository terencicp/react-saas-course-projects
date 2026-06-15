// TODO(L4) — replay: pin eventId, postWebhook twice → 200 duplicate:false then 200 duplicate:true, processed_events count 1, updatedAt unchanged across the second send, audit_logs count 1.
import { describe } from 'vitest';

describe.todo('replayed checkout event is a no-op');
