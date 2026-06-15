'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getInspectorContext } from '@/app/(protected)/inspector/_data';
import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { db } from '@/db';
import { planEntitlements } from '@/db/schema';
import { env } from '@/env';
import { err, ok, type Result } from '@/lib/result';

import { runSeed } from '../../../../scripts/seed';

// Dev-only inspector affordances, all gated NODE_ENV !== 'production'. They exist to
// drive the verification surface deterministically (the direct-write debugs) or to
// exercise the live webhook by hand (the CLI-shell debugs). None is a production
// primitive.

const PRODUCTION_GUARD =
  'This debug action is disabled in production.' as const;

const isProd = () => process.env.NODE_ENV === 'production';

// Dev-only: swap the acting user among the seeded set so the inspector can be
// viewed as each role without a real sign-in dance.
export const switchUserAction = async (
  _prev: Result<{ userId: string }> | null,
  formData: FormData,
): Promise<Result<{ userId: string }>> => {
  if (isProd()) {
    return err('forbidden', 'Identity switching is disabled in production.');
  }

  const userId = String(formData.get('userId') ?? '');
  if (!userId) {
    return err('validation', 'Pick a seeded user to act as.');
  }

  const jar = await cookies();
  jar.set(ACTING_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  revalidatePath('/inspector');
  return ok({ userId });
};

// Dev-only: re-run the deterministic seed so the inspector can be reset between
// experiments.
export const resetAndReseedAction = async (): Promise<
  Result<{ reseeded: true }>
> => {
  if (isProd()) {
    return err('forbidden', 'Reseeding is disabled in production.');
  }

  await runSeed();
  revalidatePath('/inspector');
  return ok({ reseeded: true });
};

// Dev-only: force the active org's entitlement to a chosen plan/status by writing
// the row DIRECTLY, bypassing Stripe — the deterministic gate-walk. When forcing a
// paid plan it also stamps fixture subscriptionId/currentPeriodEnd/seats so the panel
// renders a realistic projected row.

const ENTITLEMENT_PLANS = ['free', 'pro', 'team'] as const;
const ENTITLEMENT_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
] as const;

type ForcedPlan = (typeof ENTITLEMENT_PLANS)[number];
type ForcedStatus = (typeof ENTITLEMENT_STATUSES)[number];

const FIXTURE_PERIOD_END = new Date('2026-12-31T00:00:00.000Z');

export const forceEntitlementStatus = async (
  _prev: Result<{ plan: string; status: string }> | null,
  formData: FormData,
): Promise<Result<{ plan: string; status: string }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }

  const planInput = String(formData.get('plan') ?? 'free');
  const statusInput = String(formData.get('status') ?? 'active');
  if (!ENTITLEMENT_PLANS.includes(planInput as ForcedPlan)) {
    return err('validation', 'Pick a valid plan to force.');
  }
  if (!ENTITLEMENT_STATUSES.includes(statusInput as ForcedStatus)) {
    return err('validation', 'Pick a valid status to force.');
  }
  const plan = planInput as ForcedPlan;
  const status = statusInput as ForcedStatus;

  const { orgId } = await getInspectorContext();

  // A paid plan carries fixture Stripe columns so the panel renders a realistic
  // projected row; free clears them (the canceled/free shape). The write is a direct
  // UPSERT — the deterministic gate-walk bypasses the webhook entirely.
  const paid = plan !== 'free';
  const forced = {
    plan,
    status,
    subscriptionId: paid ? `sub_forced_${orgId}` : null,
    currentPeriodEnd: paid ? FIXTURE_PERIOD_END : null,
    seats: plan === 'team' ? 5 : 1,
  };

  await db
    .insert(planEntitlements)
    .values({ organizationId: orgId, ...forced })
    .onConflictDoUpdate({
      target: planEntitlements.organizationId,
      set: forced,
    });

  revalidatePath('/inspector');
  revalidatePath('/inspector/pro-only');
  return ok({ plan, status });
};

// Dev-only: POST a body to the local webhook with a FORGED stripe-signature header.
// The route verifies and answers 400 problem+json — no processed_events row appears.
// Returns the route's status + parsed body so the inspector can surface it.
export const tamperSignature = async (): Promise<
  Result<{ status: number; body: unknown }>
> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }

  const res = await fetch(`${env.APP_URL}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=0,v1=forged_signature_not_valid',
    },
    body: JSON.stringify({
      id: 'evt_forged',
      type: 'checkout.session.completed',
    }),
  });

  const body = await res.json().catch(() => null);
  return ok({ status: res.status, body });
};

// Dev-only: POST a body with NO stripe-signature header. Same 400 answer as a bad
// signature (the signature is the contract; missing and wrong are one disposition).
export const missingHeader = async (): Promise<
  Result<{ status: number; body: unknown }>
> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }

  const res = await fetch(`${env.APP_URL}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'evt_no_header',
      type: 'checkout.session.completed',
    }),
  });

  const body = await res.json().catch(() => null);
  return ok({ status: res.status, body });
};

// Dev-only CLI-shell affordances. These only take effect with `stripe listen`
// running: they shell out to the Stripe CLI to resend / re-trigger / forge events
// against the live local webhook. They are exercised by the lessons' by-hand
// checklist, not the automated render checks. Provided as wired buttons whose effect
// lands only when the CLI is forwarding.
//
// By-hand affordances — replayLastEvent: `stripe events resend <id>`; forceOlderEvent: a
// hand-rolled trigger with an older event.created; forgeMetadata: a trigger stamping
// a mismatched organization_id. Wired here as documented dev affordances; the
// scaffold returns an instruction rather than shelling out (the CLI may not be
// installed in every environment).
export const replayLastEvent = async (): Promise<Result<{ note: string }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  return ok({
    note: 'Run `stripe events resend <event_id>` with `stripe listen` forwarding to replay the last event.',
  });
};

export const forceOlderEvent = async (): Promise<Result<{ note: string }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  return ok({
    note: 'Trigger an event with an older event.created (by hand) to exercise the out-of-order no-op.',
  });
};

export const forgeMetadata = async (): Promise<Result<{ note: string }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  return ok({
    note: 'Trigger a Checkout with a mismatched organization_id in subscription_data.metadata to exercise the cross-check rejection.',
  });
};
