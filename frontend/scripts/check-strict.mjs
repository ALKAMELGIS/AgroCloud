/**
 * Strict-mode ratchet. Compiles with tsconfig.strict.json (`strict: true`) and compares the error
 * count per file with scripts/strict-baseline.json:
 *   - a file with more errors than its baseline, or a new file with errors → fail
 *   - fewer errors → pass, and `--update` lowers the baseline so the gain is locked in
 * Goal: baseline empty, then set `strict: true` in tsconfig.json and delete this script.
 *
 *   npm run typecheck:strict -w frontend            check
 *   npm run typecheck:strict -w frontend -- --update   record improvements
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselineFile = join(root, 'scripts', 'strict-baseline.json')
const update = process.argv.includes('--update')
const init = process.argv.includes('--init')

const tsc = createRequire(join(root, 'package.json')).resolve('typescript/bin/tsc')
let output = ''
try {
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.strict.json', '--noEmit'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  output = String(e.stdout || '') + String(e.stderr || '')
  // tsc exits 2 when it reports errors; anything else (not found, crashed) must not pass silently.
  if (e.status !== 2 || !/error TS\d+/.test(output)) {
    console.error('check-strict: TypeScript did not run correctly.\n', e.message, output.slice(0, 2000))
    process.exit(2)
  }
}

const current = {}
for (const line of output.split('\n')) {
  const m = /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line)
  if (m) current[m[1]] = (current[m[1]] || 0) + 1
}
const writeBaseline = () => {
  const files = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
  const total = Object.values(files).reduce((a, b) => a + b, 0)
  writeFileSync(baselineFile, JSON.stringify({ total, files }, null, 2) + '\n')
}
if (init) {
  if (existsSync(baselineFile)) {
    console.error('check-strict: a baseline already exists; it can only go down (use --update).')
    process.exit(1)
  }
  writeBaseline()
  console.log('Baseline created.')
  process.exit(0)
}
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')).files || {} : {}

const worse = []
const better = []
for (const [file, n] of Object.entries(current)) {
  const base = baseline[file] || 0
  if (n > base) worse.push(`${file}: ${base} → ${n}`)
  else if (n < base) better.push(`${file}: ${base} → ${n}`)
}
for (const [file, base] of Object.entries(baseline)) if (!current[file]) better.push(`${file}: ${base} → 0`)

const total = Object.values(current).reduce((a, b) => a + b, 0)
const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0)
console.log(`strict errors: ${total} (baseline ${baseTotal}) in ${Object.keys(current).length} files`)

if (worse.length) {
  console.error('\nNew strict-mode errors (fix them; do not raise the baseline):')
  for (const w of worse) console.error(`  ${w}`)
  console.error(`\nSee them with: npx tsc -p tsconfig.strict.json --noEmit`)
  process.exit(1)
}
if (better.length) {
  console.log(`\nImproved:\n  ${better.join('\n  ')}`)
  if (update) {
    writeBaseline()
    console.log('\nBaseline updated.')
  } else {
    console.log('\nRun with --update to lock in the improvement.')
  }
}
