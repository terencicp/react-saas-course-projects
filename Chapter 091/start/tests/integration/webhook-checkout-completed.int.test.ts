// TODO(L3) — happy path: signed checkout.session.completed → assert 200 {received,duplicate:false}, one processed_events row, plan_entitlements {plan:'pro',status:'trialing',subscriptionId,lastEventAt}, one billing.subscription.activated audit row, resendCalls empty. Wrap in withRollback; registerSubscription(fixtureSubscription(...)) for the stubbed subscriptions.retrieve.
import { describe } from 'vitest';

describe.todo('happy-path checkout.session.completed webhook');
