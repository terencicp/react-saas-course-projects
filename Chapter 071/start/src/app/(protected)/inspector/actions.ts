'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  getNotificationInspectorContext,
  resetLastDeduped,
  setLastDeduped,
} from '@/app/(protected)/inspector/_data';
import {
  ACTING_USER_COOKIE,
  type FireableType,
} from '@/app/(protected)/inspector/constants';
import { db } from '@/db';
import { resetEmailSentCount, setEmailShouldFail } from '@/lib/email';
import { dispatch as dispatchNotification } from '@/lib/notifications';
import type {
  DispatchResult,
  NotificationEvent,
} from '@/lib/notifications/types';
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

// ── Notification inspector actions ──────────────────────────────────────────────
// Dev-only affordances that drive the dispatcher loop deterministically. The fire /
// rapid-fire actions build a NotificationEvent against the ACTIVE acting user and
// `await dispatch(...)`, surfacing the returned DispatchResult into the counters. At
// scaffold dispatch throws 'dispatch not implemented'; the action catches and returns
// the error string so the page still renders.

// Fixed per-event payloads + a stable subjectId so dedup is deterministic across fires.
const fixedEvent = (
  type: FireableType,
  recipientUserId: string,
  orgName: string,
): NotificationEvent => {
  const base = {
    recipientUserIds: [recipientUserId],
    subjectId: `inspector_${type}`,
  };
  switch (type) {
    case 'org.invitation.sent':
      return {
        ...base,
        type: type as NotificationEvent['type'],
        payload: {
          invitedEmail: 'newcomer@acme.test',
          role: 'member',
          orgName,
          inviterName: 'Inspector',
          acceptUrl: 'https://acme.example/accept-invite?id=inspector',
        },
      };
    case 'org.member.role_changed':
      return {
        ...base,
        type: type as NotificationEvent['type'],
        payload: {
          newRole: 'admin',
          before: 'member',
          orgName,
          actorName: 'Inspector',
        },
      };
    case 'org.billing.past_due':
      return {
        ...base,
        type: type as NotificationEvent['type'],
        payload: { orgName, plan: 'pro' },
      };
  }
};

type FireResult = Result<{ dispatch: DispatchResult } | { error: string }>;

// Fire one event against the active user. A thrown dispatch (the scaffold state) is
// caught and returned as a string so the result panel shows it without 500-ing.
export const fireEvent = async (type: FireableType): Promise<FireResult> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  const { userId, orgName } = await getNotificationInspectorContext();
  try {
    const result = await dispatchNotification(
      fixedEvent(type, userId, orgName),
    );
    setLastDeduped(result.deduped);
    revalidatePath('/inspector');
    revalidatePath('/inbox');
    return ok({ dispatch: result });
  } catch (e) {
    revalidatePath('/inspector');
    return ok({ error: e instanceof Error ? e.message : String(e) });
  }
};

// Dispatch the same event five times in a tight loop against the same recipient/subject
// — the dedup-window demo. The aggregated DispatchResult is returned for the counters.
export const rapidFire = async (type: FireableType): Promise<FireResult> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  const { userId, orgName } = await getNotificationInspectorContext();
  const event = fixedEvent(type, userId, orgName);
  const aggregate: DispatchResult = {
    sent: 0,
    deduped: 0,
    suppressedByPrefs: 0,
  };
  try {
    for (let i = 0; i < 5; i++) {
      const result = await dispatchNotification(event);
      aggregate.sent += result.sent;
      aggregate.deduped += result.deduped;
      aggregate.suppressedByPrefs += result.suppressedByPrefs;
    }
    setLastDeduped(aggregate.deduped);
    revalidatePath('/inspector');
    revalidatePath('/inbox');
    return ok({ dispatch: aggregate });
  } catch (e) {
    revalidatePath('/inspector');
    return ok({ error: e instanceof Error ? e.message : String(e) });
  }
};

// Toggle one preference channel for the active user. The real UPSERT on
// (userId, category) lands in S2 once the table exists; here the write is guarded so a
// scaffold without the table is a no-op rather than a 500.
export const setPref = async (
  category: string,
  channel: 'email' | 'inbox' | 'push',
  value: boolean,
): Promise<Result<{ category: string; channel: string; value: boolean }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  const { userId } = await getNotificationInspectorContext();
  const column = sql.identifier(channel);
  try {
    await db.execute(sql`
      insert into user_notification_preferences (user_id, category, ${column})
      values (${userId}, ${category}, ${value})
      on conflict (user_id, category)
      do update set ${column} = ${value}, updated_at = now()
    `);
  } catch {
    // Table not present yet (pre-S1); the toggle is a no-op until the student lands it.
  }
  revalidatePath('/inspector');
  return ok({ category, channel, value });
};

// Re-run the deterministic seed and reset the in-process email counter.
export const resetAndReseed = async (): Promise<Result<{ reseeded: true }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  await runSeed();
  resetEmailSentCount();
  resetLastDeduped();
  setEmailShouldFail(false);
  revalidatePath('/inspector');
  revalidatePath('/inbox');
  return ok({ reseeded: true });
};

// Fire an event type that is NOT in the registry to prove the dispatcher throws
// REGISTRY_MISS (a programmer error, never swallowed). Returns the thrown message.
export const forceRegistryMiss = async (): Promise<
  Result<{ error: string }>
> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  const { userId } = await getNotificationInspectorContext();
  try {
    await dispatchNotification({
      type: 'does.not.exist' as NotificationEvent['type'],
      recipientUserIds: [userId],
      subjectId: 'inspector_registry_miss',
      payload: {},
    });
    return ok({ error: 'no error thrown' });
  } catch (e) {
    return ok({ error: e instanceof Error ? e.message : String(e) });
  }
};

// Toggle the email mock's fail flag — the `Make email fail` debug. Proves channel
// independence: with email failing, the inbox channel still writes its row.
export const setEmailFailing = async (
  failing: boolean,
): Promise<Result<{ failing: boolean }>> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  setEmailShouldFail(failing);
  revalidatePath('/inspector');
  return ok({ failing });
};

// The `wrap-invite-rollback` debug: a named affordance proving fire-after-commit — a
// dispatch wrapped in a rolled-back transaction notifies nobody. Wired as a documented
// dev affordance; the deterministic effect lands with the S3 call-site work.
export const wrapInviteInRollback = async (): Promise<
  Result<{ note: string }>
> => {
  if (isProd()) {
    return err('forbidden', PRODUCTION_GUARD);
  }
  return ok({
    note: 'Fire-after-commit: a dispatch wrapped in a rolled-back transaction notifies nobody. Exercised once the S3 call sites land.',
  });
};
