import { z } from 'zod';

// The validated input shape for the plan-label mutation. Named in finding 1's
// Action line as the schema the `authedAction(role, schema, fn)` wrapper would
// take — the seeded action never parses through it.
export const updatePlanLabelSchema = z.strictObject({
  planLabel: z.string().min(1).max(80),
});

export type UpdatePlanLabelInput = z.infer<typeof updatePlanLabelSchema>;
