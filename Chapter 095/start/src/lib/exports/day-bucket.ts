// The YYYY-MM-DD business-key part of the daily export idempotency key. Plain
// `Date` at the call site (the 062/065 simplification carried forward: timestamps
// stay plain JS Date at the Postgres timestamptz boundary until Unit 17). The bucket
// is UTC (toISOString), so the daily key is stable regardless of the worker timezone.
export const dayBucket = (): string => new Date().toISOString().slice(0, 10);
