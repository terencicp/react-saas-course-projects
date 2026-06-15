import { eq } from 'drizzle-orm';

import { db } from '@/db/index';
import { customers } from '@/db/schema';

// An org-scoped read of the customers list, used to populate the customerId
// <NativeSelect> on the create/edit forms. The tenant filter lives in the
// where, never a post-load check.
export const listCustomers = async (
  organizationId: string,
): Promise<{ id: string; name: string }[]> =>
  db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.organizationId, organizationId))
    .orderBy(customers.name);
