import test from 'node:test'
import assert from 'node:assert/strict'
import { closeDatabase, connect, getDatabase, query, translatePlaceholders, withTransaction } from '../server/database/connection.js'

test.after(() => closeDatabase())

test('translatePlaceholders maps $n in occurrence order and skips quoted text', () => {
  const r = translatePlaceholders(`SELECT '$1', $2, $1, "$3" WHERE a = $2`, ['a', 'b', 'c'])
  assert.equal(r.sql, `SELECT '$1', ?, ?, "$3" WHERE a = ?`)
  assert.deepEqual(r.values, ['b', 'a', 'b'])
  assert.throws(() => translatePlaceholders('SELECT $2', ['x']), /no value/)
})

test('values map Date/boolean/object to SQLite and back', async () => {
  getDatabase().exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, created_at TEXT, email_verified INTEGER, metadata TEXT)`)
  const d = new Date('2026-01-02T03:04:05.000Z')
  await query(`INSERT INTO t (created_at, email_verified, metadata) VALUES ($1, $2, $3)`, [d, true, { a: 1 }])
  const { rows, rowCount } = await query(`SELECT * FROM t`)
  assert.equal(rowCount, 1)
  assert.deepEqual(rows[0].created_at, d)
  assert.equal(rows[0].email_verified, true)
  assert.deepEqual(rows[0].metadata, { a: 1 })
  assert.match((await query(`SELECT gen_random_uuid() AS u, now() AS n`)).rows[0].u, /^[0-9a-f-]{36}$/)
})

test('outside queries wait for an open transaction; rollback undoes it', async () => {
  getDatabase().exec(`CREATE TABLE k (v TEXT)`)
  const order = []
  const client = await connect()
  await client.query('BEGIN IMMEDIATE')
  await client.query(`INSERT INTO k VALUES ('inside')`)
  const outside = query(`SELECT COUNT(*) AS n FROM k`).then((r) => order.push(`outside:${r.rows[0].n}`))
  await new Promise((r) => setTimeout(r, 20))
  order.push('commit')
  await client.query('COMMIT')
  client.release()
  await outside
  assert.deepEqual(order, ['commit', 'outside:1'])

  await assert.rejects(
    withTransaction(async (c) => {
      await c.query(`INSERT INTO k VALUES ('lost')`)
      throw new Error('boom')
    }),
    /boom/,
  )
  assert.equal((await query(`SELECT COUNT(*) AS n FROM k`)).rows[0].n, 1)
})
