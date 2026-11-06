import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

// Fake pool: counts permission queries per role.
let queries = 0
const fakePool = {
  async query(sql, params) {
    if (/FROM role_permissions/.test(sql)) {
      queries++
      return { rows: params[0] === 'role-admin' ? [{ code: 'users.read' }, { code: 'users.write' }] : [{ code: 'users.read' }] }
    }
    return { rows: [] }
  },
}

mock.module('../server/identity/db.js', {
  namedExports: { getPool: () => fakePool, isIdentityReady: () => true },
})

const { loadUserPermissions, clearRolePermissionCache } = await import('../server/identity/sessionService.js')

test('role permissions are queried once per role within the TTL', async () => {
  clearRolePermissionCache()
  queries = 0
  const a = await loadUserPermissions('u1', 'role-admin')
  const b = await loadUserPermissions('u2', 'role-admin')
  const c = await loadUserPermissions('u3', 'role-viewer')
  assert.deepEqual(a, ['users.read', 'users.write'])
  assert.deepEqual(b, a)
  assert.deepEqual(c, ['users.read'])
  assert.equal(queries, 2, 'one query per distinct role')
})

test('callers get a copy, so mutating the result cannot poison the cache', async () => {
  clearRolePermissionCache()
  const a = await loadUserPermissions('u1', 'role-admin')
  a.push('everything.delete')
  const b = await loadUserPermissions('u1', 'role-admin')
  assert.deepEqual(b, ['users.read', 'users.write'])
})

test('clearing the cache forces a fresh query', async () => {
  clearRolePermissionCache()
  queries = 0
  await loadUserPermissions('u1', 'role-admin')
  clearRolePermissionCache()
  await loadUserPermissions('u1', 'role-admin')
  assert.equal(queries, 2)
})
