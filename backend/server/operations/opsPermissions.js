/**
 * Operations forms — role permissions.
 *
 * Matrix stored in ops_settings.permissions: { [role]: { forms: { [formId]: action[] }, admin: adminAction[] } }.
 * Roles follow the app's roles (Admin, Admin Manager, Manager, Editor, Viewer). With identity on, the
 * role comes from the signed-in session; with identity off it comes from the client profile header
 * (the same trust level as the actor name in that mode). Admin always has every right, so nobody can
 * lock the system out of its own settings.
 */
import { FORMS } from './formSchemas.js'

export const OPS_ROLES = ['Admin', 'Admin Manager', 'Manager', 'Editor', 'Viewer']
/** Per-form actions. `export` covers Excel/CSV export and PDF/Excel/Word reports. */
export const FORM_ACTIONS = ['view', 'create', 'edit', 'delete', 'import', 'export']
/** System-wide actions: lookup lists, settings (incl. this matrix), audit log. */
export const ADMIN_ACTIONS = ['lists', 'settings', 'audit']

const ALL_FORM = FORM_ACTIONS
const ROLE_DEFAULTS = {
  Admin: { form: ALL_FORM, admin: ADMIN_ACTIONS },
  'Admin Manager': { form: ALL_FORM, admin: ADMIN_ACTIONS },
  Manager: { form: ALL_FORM, admin: ['lists', 'audit'] },
  Editor: { form: ['view', 'create', 'edit', 'import', 'export'], admin: [] },
  Viewer: { form: ['view', 'export'], admin: [] },
}

export function defaultPermissions() {
  const out = {}
  for (const role of OPS_ROLES) {
    const d = ROLE_DEFAULTS[role]
    out[role] = { forms: Object.fromEntries(FORMS.map((f) => [f.id, [...d.form]])), admin: [...d.admin] }
  }
  return out
}

/** Merge a stored (possibly partial / stale) matrix over the defaults, dropping unknown keys. */
export function normalizePermissions(stored) {
  const base = defaultPermissions()
  if (!stored || typeof stored !== 'object') return base
  for (const role of OPS_ROLES) {
    const s = stored[role]
    if (!s || typeof s !== 'object') continue
    for (const f of FORMS) {
      const acts = s.forms?.[f.id]
      if (Array.isArray(acts)) base[role].forms[f.id] = FORM_ACTIONS.filter((a) => acts.includes(a))
    }
    if (Array.isArray(s.admin)) base[role].admin = ADMIN_ACTIONS.filter((a) => s.admin.includes(a))
  }
  // Admin keeps everything.
  base.Admin = { forms: Object.fromEntries(FORMS.map((f) => [f.id, [...FORM_ACTIONS]])), admin: [...ADMIN_ACTIONS] }
  // Any write implies view.
  for (const role of OPS_ROLES) {
    for (const f of FORMS) {
      const acts = base[role].forms[f.id]
      if (acts.length && !acts.includes('view')) acts.unshift('view')
    }
  }
  return base
}

/** Normalise any role label (identity role codes or app roles) to an ops role. */
export function normalizeRole(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (!raw) return 'Viewer'
  if (raw.includes('admin') && raw.includes('manager')) return 'Admin Manager'
  if (['admin', 'administrator', 'owner', 'director', 'super admin', 'superadmin'].includes(raw)) return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (['editor', 'supervisor', 'operator', 'data entry'].includes(raw)) return 'Editor'
  return 'Viewer'
}

export function roleOfRequest(req) {
  const a = req.identityActor
  if (a) return normalizeRole(a.user?.role_code ?? a.user?.role_name)
  const header = String(req.get('x-agrocloud-role') || '').trim()
  // No identity and no role header: older clients — keep them working as editors, never as admins.
  return header ? normalizeRole(decodeURIComponentSafe(header)) : 'Editor'
}

function decodeURIComponentSafe(v) {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

export function rightsFor(matrix, role) {
  return matrix[role] ?? matrix.Viewer
}

export function canForm(rights, formId, action) {
  return Boolean(rights?.forms?.[formId]?.includes(action))
}

export function canAdmin(rights, action) {
  return Boolean(rights?.admin?.includes(action))
}
