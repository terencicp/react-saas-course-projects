import 'server-only';

// TODO(L3) — withTenant(orgId, fn): db.transaction + set_config('app.org_id', orgId,
// true) before fn(tx).
export const withTenant = async <T>(
  _orgId: string,
  _fn: (tx: never) => Promise<T>,
): Promise<T> => {
  throw new Error('withTenant not implemented');
};

// TODO(L4) — tenantDb(orgId): typed facade injecting the org predicate on
// .query/.insert/.update/.delete; TENANT_TABLES drives the typed surface; no
// .raw/allOrgs bypass.
export const tenantDb = (_orgId: string) => {
  throw new Error('tenantDb not implemented');
};
