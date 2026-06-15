import 'server-only';

// The inspector's debug flags, backed by a single `globalThis` slot so they
// survive across the module instances Next can create and are visible to every
// server module (the route wrapper, the tool, the inspector itself). They exist
// ONLY to make the failure modes visible by hand in the inspector — all default
// off, none is reachable in normal operation.
//
// Split-statement init (never `??=` inside an expression): the one-line form
// trips Biome's `lint/suspicious/noAssignInExpressions` and fails `biome ci`.
type InspectorFlags = {
  // Makes `authedRoute` refuse with a 401 — stands in for the unauthenticated
  // request the cookie dev-session never produces, to prove the auth guard.
  BYPASS_AUTHED_ROUTE: boolean;
  // Makes `buildInvoiceTools` read `orgId` from the model's tool input instead
  // of the server closure — exposes the cross-tenant leak the closure prevents.
  MODEL_FROM_INPUT_ORGID: boolean;
  // Makes `getInvoiceStats.execute` return `{ error: 'stats_unavailable' }` so
  // the output-error tool-part state is demonstrable.
  FORCE_TOOL_ERROR: boolean;
};

const globalForFlags = globalThis as typeof globalThis & {
  __inspectorFlags?: InspectorFlags;
};

globalForFlags.__inspectorFlags ??= {
  BYPASS_AUTHED_ROUTE: false,
  MODEL_FROM_INPUT_ORGID: false,
  FORCE_TOOL_ERROR: false,
};

const flags = globalForFlags.__inspectorFlags;

export const getFlag = (name: keyof InspectorFlags): boolean => flags[name];

export const setFlag = (name: keyof InspectorFlags, value: boolean): void => {
  flags[name] = value;
};

export const toggleFlag = (name: keyof InspectorFlags): boolean => {
  flags[name] = !flags[name];
  return flags[name];
};

export const allFlags = (): InspectorFlags => ({ ...flags });
