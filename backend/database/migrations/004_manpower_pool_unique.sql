-- One organisation-wide manpower pool row per (organisation, role).
--
-- The table's UNIQUE (organization_id, role_code, holder_user_id) cannot enforce this: the pool row
-- has holder_user_id = NULL, and NULLs never conflict, so `INSERT … ON CONFLICT DO NOTHING` added a
-- new empty row each time. Keep the pool row with the largest quota, then forbid duplicates.

DELETE FROM manpower_allocations
WHERE holder_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM manpower_allocations k
    WHERE k.holder_user_id IS NULL
      AND k.organization_id = manpower_allocations.organization_id
      AND k.role_code = manpower_allocations.role_code
      AND (k.total > manpower_allocations.total
           OR (k.total = manpower_allocations.total AND k.rowid < manpower_allocations.rowid))
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_manpower_org_role_pool
  ON manpower_allocations (organization_id, role_code)
  WHERE holder_user_id IS NULL;
