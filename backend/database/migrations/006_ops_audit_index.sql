-- Audit log browsing: newest-first lists filtered by date / user / action.
CREATE INDEX IF NOT EXISTS ops_audit_at_idx ON ops_audit (at);
CREATE INDEX IF NOT EXISTS ops_audit_actor_idx ON ops_audit (actor);
