import { z } from 'zod';

// The per-step Zod schemas + the composite payload. Pure: no React, no
// `'use server'`. The wizard derives per-step validity by running these against
// each slice (`selectIsStepValid`), and the Server Action re-parses the
// composite `createCustomerInput` at the boundary — the gate is UX, the re-parse
// is correctness.

export const contactSchema = z.strictObject({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email(),
  phone: z.string().min(7).max(20),
});

export const billingSchema = z.strictObject({
  line1: z.string().min(1),
  line2: z.string(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().length(2),
  taxId: z.string().min(1),
  paymentTerms: z.enum(['net15', 'net30', 'net60']),
});

export const preferencesSchema = z.strictObject({
  channels: z.array(z.enum(['email', 'sms', 'inApp'])).min(1),
  defaultCurrency: z.string().length(3),
  language: z.enum(['en-US', 'en-GB', 'fr-FR']),
});

export const createCustomerInput = z.strictObject({
  contact: contactSchema,
  billing: billingSchema,
  preferences: preferencesSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerInput>;
