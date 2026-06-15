import { timestamp } from 'drizzle-orm/pg-core';

// Reusable column groups spread into table definitions with `...timestamps`.
// This project only needs createdAt (the cursor's sort/tiebreaker key); no
// updatedAt/softDelete is required here.
// precision: 3 pins createdAt to millisecond precision so it round-trips
// exactly through the cursor token (a JS Date is millisecond-precise); the
// cursor predicate then compares dates directly with the clean lt/eq form.
export const timestamps = {
  createdAt: timestamp({ withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
};
