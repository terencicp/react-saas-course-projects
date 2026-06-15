import 'server-only';

// The barrel is the only entry point call sites import: they build a NotificationEvent and
// `await dispatch(...)`, never importing a channel or writing the notifications table
// directly. EventType is re-exported so a call site's event literal is checked against the
// registry.
export { dispatch } from './dispatcher';
export type { EventType } from './registry';
export type { DispatchResult, NotificationEvent } from './types';
