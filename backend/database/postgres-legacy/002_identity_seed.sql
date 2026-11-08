-- Seed permissions and system roles (idempotent via ON CONFLICT)

INSERT INTO permissions (code, description, resource, action) VALUES
  ('users.view', 'View users', 'users', 'view'),
  ('users.create', 'Create users', 'users', 'create'),
  ('users.update', 'Update users', 'users', 'update'),
  ('users.disable', 'Disable users', 'users', 'disable'),
  ('users.delete', 'Delete users', 'users', 'delete'),
  ('managers.view', 'View managers', 'managers', 'view'),
  ('managers.create', 'Create managers', 'managers', 'create'),
  ('managers.update', 'Update managers', 'managers', 'update'),
  ('supervisors.view', 'View supervisors', 'supervisors', 'view'),
  ('supervisors.create', 'Create supervisors', 'supervisors', 'create'),
  ('supervisors.update', 'Update supervisors', 'supervisors', 'update'),
  ('roles.view', 'View roles', 'roles', 'view'),
  ('roles.assign', 'Assign roles', 'roles', 'assign'),
  ('roles.update', 'Update roles', 'roles', 'update'),
  ('permissions.view', 'View permissions', 'permissions', 'view'),
  ('permissions.assign', 'Assign permissions', 'permissions', 'assign'),
  ('manpower.view', 'View manpower', 'manpower', 'view'),
  ('manpower.allocate', 'Allocate manpower', 'manpower', 'allocate'),
  ('manpower.increase', 'Increase manpower pool', 'manpower', 'increase'),
  ('manpower.decrease', 'Decrease manpower pool', 'manpower', 'decrease'),
  ('manpower.transfer', 'Transfer manpower', 'manpower', 'transfer'),
  ('organization.view', 'View organization', 'organization', 'view'),
  ('organization.update', 'Update organization', 'organization', 'update'),
  ('farms.view', 'View farms', 'farms', 'view'),
  ('farms.create', 'Create farms', 'farms', 'create'),
  ('farms.update', 'Update farms', 'farms', 'update'),
  ('pivots.view', 'View pivots', 'pivots', 'view'),
  ('pivots.create', 'Create pivots', 'pivots', 'create'),
  ('pivots.update', 'Update pivots', 'pivots', 'update'),
  ('raster.view', 'View raster layers', 'raster', 'view'),
  ('raster.manage', 'Manage raster layers', 'raster', 'manage'),
  ('dashboard.view', 'View dashboards', 'dashboard', 'view'),
  ('dashboard.manage', 'Manage dashboards', 'dashboard', 'manage')
ON CONFLICT (code) DO NOTHING;

-- System roles (organization_id NULL = global template)
INSERT INTO roles (organization_id, code, name, level, description, is_system_role)
SELECT NULL, v.code, v.name, v.level, v.description, true
FROM (VALUES
  ('OWNER', 'Owner', 100, 'Organization owner'),
  ('DIRECTOR', 'Director', 80, 'Director / super admin'),
  ('MANAGER', 'Manager', 60, 'Manager'),
  ('SUPERVISOR', 'Supervisor', 40, 'Supervisor'),
  ('STAFF', 'Staff', 20, 'Field user / staff')
) AS v(code, name, level, description)
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.organization_id IS NULL AND r.code = v.code
);

-- OWNER: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND r.code = 'OWNER'
ON CONFLICT DO NOTHING;

-- DIRECTOR: all except organization.update optional - grant all for simplicity minus none
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND r.code = 'DIRECTOR'
  AND p.code NOT IN ('permissions.assign')
ON CONFLICT DO NOTHING;

-- MANAGER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.view','users.create','users.update','users.disable',
  'supervisors.view','supervisors.create','supervisors.update',
  'manpower.view','manpower.allocate',
  'farms.view','farms.update','pivots.view','pivots.update',
  'raster.view','dashboard.view','organization.view','roles.view'
)
WHERE r.organization_id IS NULL AND r.code = 'MANAGER'
ON CONFLICT DO NOTHING;

-- SUPERVISOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.view','farms.view','pivots.view','raster.view','dashboard.view'
)
WHERE r.organization_id IS NULL AND r.code = 'SUPERVISOR'
ON CONFLICT DO NOTHING;

-- STAFF view-only bundle
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'farms.view','pivots.view','raster.view','dashboard.view'
)
WHERE r.organization_id IS NULL AND r.code = 'STAFF'
ON CONFLICT DO NOTHING;

INSERT INTO organizations (slug, name)
SELECT 'default', 'Default Organization'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'default');
