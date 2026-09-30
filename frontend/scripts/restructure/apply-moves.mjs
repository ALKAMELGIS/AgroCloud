/**
 * One-off: applies move-map.json for the given phase(s) and rewrites every
 * relative / "@/" path literal that points at a moved file (or sits in a moved file).
 * Usage: node scripts/restructure/apply-moves.mjs A [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const frontendRoot = path.resolve(here, '../..')
const srcRoot = path.join(frontendRoot, 'src')
const phases = new Set((process.argv[2] || '').split(',').filter(Boolean))
const dry = process.argv.includes('--dry')
if (!phases.size) throw new Error('phase required, e.g. A or A,B')

const toPosix = (p) => p.split(path.sep).join('/')
const abs = (rel) => path.join(srcRoot, rel)

const allMoves = JSON.parse(fs.readFileSync(path.join(here, 'move-map.json'), 'utf8'))
const moves = allMoves.filter((m) => phases.has(m.phase) && fs.existsSync(abs(m.from)))
const moveMap = new Map(moves.map((m) => [path.normalize(abs(m.from)).toLowerCase(), path.normalize(abs(m.to))]))
const newPathOf = (p) => moveMap.get(path.normalize(p).toLowerCase()) || p

const SCAN_DIRS = [srcRoot, path.join(frontendRoot, 'tests'), path.join(frontendRoot, 'config'), path.join(frontendRoot, 'scripts')]
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'])
const RESOLVE_EXT = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css']

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'restructure') continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (TEXT_EXT.has(path.extname(ent.name))) out.push(p)
  }
  return out
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function resolveSpec(importer, spec) {
  const base = spec.startsWith('@/') ? path.join(srcRoot, spec.slice(2)) : path.resolve(path.dirname(importer), spec)
  if (isFile(base)) return { target: base, kind: 'exact' }
  for (const ext of RESOLVE_EXT) if (isFile(base + ext)) return { target: base + ext, kind: 'ext', ext }
  for (const ext of RESOLVE_EXT) {
    const p = path.join(base, 'index' + ext)
    if (isFile(p)) return { target: p, kind: 'index', ext }
  }
  return null
}

function layerKey(p) {
  const rel = toPosix(path.relative(srcRoot, p))
  if (rel.startsWith('..')) return null
  const seg = rel.split('/')
  return seg[0] === 'modules' ? `modules/${seg[1]}` : seg[0]
}

const MODULE_CTX = /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|unmock|importActual|importMock)\s*(?:<[^>]*>)?\s*\(\s*)$/

function buildSpec({ importerNew, targetNew, resolved, moduleCtx, isCss, wasAlias }) {
  let specTarget = targetNew
  if (resolved.kind === 'index') {
    specTarget = path.basename(targetNew).startsWith('index.') ? path.dirname(targetNew) : targetNew.slice(0, -resolved.ext.length)
  } else if (resolved.kind === 'ext') {
    specTarget = targetNew.slice(0, -resolved.ext.length)
  }
  const inSrc = (p) => !toPosix(path.relative(srcRoot, p)).startsWith('..')
  const crossLayer = layerKey(importerNew) !== layerKey(targetNew)
  const useAlias = moduleCtx && !isCss && inSrc(targetNew) && inSrc(importerNew) && (wasAlias || crossLayer)
  if (useAlias) return '@/' + toPosix(path.relative(srcRoot, specTarget))
  let rel = toPosix(path.relative(path.dirname(importerNew), specTarget))
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

const LITERAL = /(['"`])((?:\.{1,2}\/|@\/)[^'"`\n$]*?)\1/g
const CSS_URL = /url\(\s*((?:\.{1,2}\/)[^)'"\s]+)\s*\)/g

let changedFiles = 0
let rewrites = 0
const pending = []
for (const file of [...SCAN_DIRS.flatMap((d) => walk(d))]) {
  const text = fs.readFileSync(file, 'utf8')
  const importerNew = newPathOf(file)
  const importerMoved = importerNew !== file
  const isCss = path.extname(file) === '.css'
  const rewriteOne = (full, spec, offset, quote) => {
    const q = spec.search(/[?#]/)
    const bare = q === -1 ? spec : spec.slice(0, q)
    const suffix = q === -1 ? '' : spec.slice(q)
    const resolved = resolveSpec(file, bare)
    if (!resolved) return null
    const targetNew = newPathOf(resolved.target)
    if (!importerMoved && targetNew === resolved.target) return null
    const before = text.slice(Math.max(0, offset - 60), offset)
    const moduleCtx = quote !== null && MODULE_CTX.test(before)
    const next = buildSpec({ importerNew, targetNew, resolved, moduleCtx, isCss, wasAlias: bare.startsWith('@/') }) + suffix
    if (next === spec) return null
    rewrites++
    return next
  }
  let out = text.replace(LITERAL, (full, quote, spec, offset) => {
    const next = rewriteOne(full, spec, offset, quote)
    return next === null ? full : quote + next + quote
  })
  if (isCss) {
    out = out.replace(CSS_URL, (full, spec, offset) => {
      const next = rewriteOne(full, spec, offset, null)
      return next === null ? full : `url(${next})`
    })
  }
  if (out !== text) {
    changedFiles++
    pending.push([file, out])
  }
}

console.log(`phase(s)=${[...phases].join(',')} moves=${moves.length} filesRewritten=${changedFiles} literalRewrites=${rewrites}${dry ? ' (dry run)' : ''}`)
if (dry) process.exit(0)

for (const [file, out] of pending) fs.writeFileSync(file, out)
for (const m of moves) {
  const dest = abs(m.to)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(abs(m.from), dest)
}

function pruneEmpty(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) if (ent.isDirectory()) pruneEmpty(path.join(dir, ent.name))
  if (dir !== srcRoot && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}
pruneEmpty(srcRoot)
console.log('done')
