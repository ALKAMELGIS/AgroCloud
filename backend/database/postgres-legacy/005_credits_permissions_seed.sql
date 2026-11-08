-- Credits / usage permissions (idempotent)

INSERT INTO permissions (code, description, resource, action) VALUES
  ('credits.read', 'View own credit balance and history', 'credits', 'read'),
  ('credits.add', 'Add credits to users (admin)', 'credits', 'add'),
  ('credits.remove', 'Remove credits from users (admin)', 'credits', 'remove'),
  ('usage.read', 'View usage analytics', 'usage', 'read'),
  ('audit_logs.read', 'View audit logs', 'audit_logs', 'read'),
  ('subscriptions.read', 'View subscriptions', 'subscriptions', 'read'),
  ('subscriptions.manage', 'Manage subscriptions', 'subscriptions', 'manage')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND r.code IN ('OWNER', 'DIRECTOR')
  AND p.code IN (
    'credits.read', 'credits.add', 'credits.remove', 'usage.read',
    'audit_logs.read', 'subscriptions.read', 'subscriptions.manage'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('credits.read', 'usage.read')
WHERE r.organization_id IS NULL AND r.code IN ('MANAGER', 'SUPERVISOR', 'STAFF')
ON CONFLICT DO NOTHING;
