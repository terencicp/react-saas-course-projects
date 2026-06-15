import 'server-only';

import type { ReactNode } from 'react';

import { err, type Result } from '@/lib/result';

export type SendInput = {
  to: string;
  subject: string;
  react: ReactNode;
  idempotencyKey: string;
  replyTo?: string;
  bypassSuppression?: boolean;
};

export const sendEmail = async (
  _input: SendInput,
): Promise<Result<{ id: string }>> => {
  // TODO(L3) — singleton Resend client, suppression read at the boundary, env-default from/replyTo, return Result
  return err('internal', 'sendEmail not implemented');
};
