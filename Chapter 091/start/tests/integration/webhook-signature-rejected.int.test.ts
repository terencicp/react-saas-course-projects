// TODO(L5) — tamper: postWebhook(event,{tamperSignature:true}) → 400 application/problem+json {title:'invalid_signature'}, processed_events 0, plan_entitlements still free, audit_logs 0, resendCalls 0.
import { describe } from 'vitest';

describe.todo('tampered signature is rejected before any work');
