import 'server-only';

// TODO(L2) — re-export dispatch + the public types
export { dispatch } from './dispatcher';
export type { DispatchResult, NotificationEvent } from './types';
