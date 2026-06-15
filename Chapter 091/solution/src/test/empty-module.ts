// Aliased for `server-only` / `client-only` in the integration Vitest project. The route
// transitively imports `server-only`, which throws "cannot be imported from a Client
// Component module" under the Node test env; resolving it to this no-op module lets the
// real handler import cleanly. Never imported by app code.
export {};
