/**
 * Lists module-specifier / CSS url literals under src that do not resolve to a file.
 * Usage: node scripts/restructure/check-imports.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const srcRoot = process.env.SRC_ROOT ? path.resolve(process.env.SRC_ROOT) : path.resolve(here, '../../src')
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css'])
const RESOLVE_EXT = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.json', '.css']
const MODULE_CTX = /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\bvi\.(?:mock|doMock|importActual)\s*(?:<[^>]*>)?\s*\(\s*)$/

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
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
function resolves(importer, spec) {
  const bare = spec.split(/[?#]/)[0]
  const base = bare.startsWith('@/') ? path.join(srcRoot, bare.slice(2)) : path.resolve(path.dirname(importer), bare)
  return RESOLVE_EXT.some((e) => isFile(base + e)) || RESOLVE_EXT.slice(1).some((e) => isFile(path.join(base, 'index' + e)))
}

const bad = []
for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, 'utf8')
  const rel = path.relative(srcRoot, file).split(path.sep).join('/')
  for (const m of text.matchAll(/(['"`])((?:\.{1,2}\/|@\/)[^'"`\n$]*?)\1/g)) {
    const before = text.slice(Math.max(0, m.index - 60), m.index)
    if (!MODULE_CTX.test(before) && !file.endsWith('.css')) continue
    if (!resolves(file, m[2])) bad.push(`${rel} -> ${m[2]}`)
  }
  if (file.endsWith('.css')) {
    for (const m of text.matchAll(/url\(\s*((?:\.{1,2}\/)[^)'"\s]+)\s*\)/g)) if (!resolves(file, m[1])) bad.push(`${rel} -> ${m[1]}`)
  }
}
console.log(`UNRESOLVED=${bad.length}`)
for (const b of bad) console.log(b)
