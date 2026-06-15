// The sanctioned billing barrel: re-export EXACTLY the three interface methods.
// No wildcard re-export, and no stripe / BillingError / catalog re-export — the SDK
// and the error class stay internal to lib/billing. Surfaces import
// `billing.upgrade`/`billing.openPortal`/`billing.requirePlan` from here.
export { openPortal } from '@/lib/billing/portal';
export { requirePlan } from '@/lib/billing/require-plan';
export { upgrade } from '@/lib/billing/upgrade';
