import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeDatabase, getDatabase } from '../server/database/connection.js'
import {
  documentKeyForFile,
  flushDocuments,
  listDocuments,
  readDocument,
  readFileDocument,
  resetDocumentCache,
  writeDocument,
} from '../server/database/documentStore.js'
import { mergeAndWriteApiSecrets, readApiSecretsFile } from '../server/persistence/apiSecretsPersistence.js'
import { readAdminDirectoryStore, writeAdminDirectoryStore } from '../server/persistence/adminDirectoryPersistence.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agro-docs-'))
test.after(() => {
  closeDatabase()
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('missing store reads as absent; writes persist to SQLite', async () => {
  assert.deepEqual(readDocument('nothing'), { exists: false, value: undefined })
  await writeDocument('cfg', { a: 1 })
  const r = readDocument('cfg')
  r.value.a = 99 // callers get a copy, not the cached object
  assert.deepEqual(readDocument('cfg').value, { a: 1 })
  resetDocumentCache() // force a read from the database
  assert.deepEqual(readDocument('cfg').value, { a: 1 })
})

test('legacy JSON file is imported once and left in place as a backup', async () => {
  const file = path.join(tmp, 'legacy_store.json')
  fs.writeFileSync(file, JSON.stringify([{ id: 1 }]))
  assert.deepEqual(readFileDocument(file).value, [{ id: 1 }])
  await flushDocuments()
  const row = getDatabase().prepare('SELECT * FROM documents WHERE store = ?').get(documentKeyForFile(file))
  assert.equal(row.legacy_path, file)
  assert.ok(row.imported_at)

  fs.writeFileSync(file, JSON.stringify([{ id: 'changed on disk' }]))
  resetDocumentCache()
  assert.deepEqual(readFileDocument(file).value, [{ id: 1 }], 'database wins after import')
  assert.ok(fs.existsSync(file))
})

test('invalid legacy JSON is not imported', () => {
  const file = path.join(tmp, 'broken.json')
  fs.writeFileSync(file, '{not json')
  assert.equal(readFileDocument(file).exists, false)
})

test('store keys: standard files use their name, others include the directory', () => {
  assert.equal(documentKeyForFile(path.resolve('server/agri_api_secrets.json')), 'agri_api_secrets')
  assert.equal(documentKeyForFile(path.join(tmp, 'x.json')), `x@${tmp}`)
})

test('api secrets and admin directory keep their file-path APIs', async () => {
  const secrets = path.join(tmp, 'agri_api_secrets.json')
  assert.equal(readApiSecretsFile(secrets).persisted, false)
  mergeAndWriteApiSecrets(secrets, { mapboxToken: 'pk.test', customSlots: { s1: 'v1' } })
  mergeAndWriteApiSecrets(secrets, { customSlots: { s1: '' } })
  assert.deepEqual(readApiSecretsFile(secrets).secrets, { version: 3, builtin: { mapboxToken: 'pk.test' }, customSlots: {} })

  const dir = path.join(tmp, 'agri_admin_directory.json')
  writeAdminDirectoryStore(dir, { users: [{ id: 1, email: 'a@b.c' }], auditLog: [] })
  await flushDocuments()
  resetDocumentCache()
  const { persisted, data } = readAdminDirectoryStore(dir)
  assert.equal(persisted, true)
  assert.equal(data.users[0].email, 'a@b.c')
  assert.equal(fs.existsSync(dir), false, 'no JSON file is written any more')
  assert.ok(listDocuments().some((d) => d.store.startsWith('agri_admin_directory@')))
})
