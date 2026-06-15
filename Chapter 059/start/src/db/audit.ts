// TODO(L3) — define auditLogs (full column set, actorIp as text, payload jsonb, two
// composite indexes), .enableRLS(), and three pgPolicy rules (org-isolation FOR ALL +
// deny update + deny delete). Then a --custom migration adding FORCE ROW LEVEL
// SECURITY.

export {};
