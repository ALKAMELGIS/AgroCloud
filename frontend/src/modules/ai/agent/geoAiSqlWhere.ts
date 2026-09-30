/**
 * Safe, limited SQL-WHERE-style filtering for Geo AI “Select by attributes”.
 * No arbitrary code — only property comparisons on a flat attribute bag.
 */

export function extractWhereFromQuery(query: string): string | null {
  const u = query.toUpperCase()
  const idx = u.indexOf(' WHERE ')
  if (idx < 0) return null
  let rest = query.slice(idx + 7).trim()
  const order = /\sORDER\s+BY\s/i
  const m = rest.match(order)
  if (m?.index != null) rest = rest.slice(0, m.index).trim()
  const limit = /\sLIMIT\s+\d+/i
  const m2 = rest.match(limit)
  if (m2?.index != null) rest = rest.slice(0, m2.index).trim()
  return rest.length ? rest : null
}

export function hasSqlWhereIntent(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (/\bselect\s+by\s+attributes?\b/i.test(q)) return true
  if (/\bFROM\s+[\s\S]{0,240}\bWHERE\b/i.test(q)) return true
  return /\bSELECT\s+[\s\S]{0,600}\bWHERE\b/i.test(q)
}

function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quote: "'" | '"' | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (quote) {
      cur += ch
      if (ch === quote && input[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch as "'" | '"'
      cur += ch
      continue
    }
    if (ch === '(') {
      depth++
      cur += ch
      continue
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      cur += ch
      continue
    }
    if (depth === 0 && input.slice(i, i + sep.length).toUpperCase() === sep.toUpperCase()) {
      out.push(cur.trim())
      cur = ''
      i += sep.length - 1
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function normalizeLikePattern(sqlLike: string): RegExp | null {
  const esc = sqlLike.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  try {
    return new RegExp(`^${esc}$`, 'i')
  } catch {
    return null
  }
}

function parseInList(inner: string): string[] | null {
  const parts: string[] = []
  let cur = ''
  let quote: "'" | '"' | null = null
  for (let i = 0; i <= inner.length; i++) {
    const ch = i < inner.length ? inner[i]! : ','
    if (i === inner.length || (ch === ',' && !quote)) {
      const t = cur.trim()
      if (t) parts.push(t.replace(/^['"]|['"]$/g, ''))
      cur = ''
      if (i === inner.length) break
      continue
    }
    if (ch === "'" || ch === '"') {
      if (!quote) quote = ch
      else if (ch === quote) quote = null
      cur += ch
      continue
    }
    cur += ch
  }
  return parts.length ? parts : null
}

/** Evaluate one comparison; returns null if not recognized. */
function evalAtom(atom: string, props: Record<string, unknown>): boolean | null {
  const a = atom.trim()
  if (!a) return null

  const mIn = a.match(/^([A-Za-z_][\w]*)\s+IN\s*\(([^)]*)\)\s*$/i)
  if (mIn) {
    const field = mIn[1]
    const list = parseInList(mIn[2])
    if (!list) return false
    const fv = props[field]
    const s = fv == null ? null : String(fv)
    if (s == null) return false
    return list.some(v => v.toLowerCase() === s.toLowerCase())
  }

  const mLike = a.match(/^([A-Za-z_][\w]*)\s+LIKE\s+('([^']*)'|"([^"]*)")\s*$/i)
  if (mLike) {
    const field = mLike[1]
    const pat = (mLike[3] ?? mLike[4] ?? '').replace(/''/g, "'")
    const re = normalizeLikePattern(pat)
    if (!re) return null
    const fv = props[field]
    if (fv == null) return false
    return re.test(String(fv))
  }

  const mNull = a.match(/^([A-Za-z_][\w]*)\s+IS\s+(NOT\s+)?NULL\s*$/i)
  if (mNull) {
    const field = mNull[1]
    const not = Boolean(mNull[2]?.trim())
    const v = props[field]
    const isNull = v == null || v === ''
    return not ? !isNull : isNull
  }

  const mEq = a.match(/^([A-Za-z_][\w]*)\s*(=|<>|!=)\s*(.+)\s*$/i)
  if (mEq) {
    const field = mEq[1]
    const op = mEq[2].toLowerCase()
    let rhs = mEq[3].trim()
    let rhsVal: string | number | null = null
    if (/^'([^']*)'$/.test(rhs)) {
      rhsVal = rhs.slice(1, -1).replace(/''/g, "'")
    } else if (/^"([^"]*)"$/.test(rhs)) {
      rhsVal = rhs.slice(1, -1)
    } else if (/^-?\d+(?:\.\d+)?$/.test(rhs)) {
      rhsVal = Number(rhs)
    } else {
      return null
    }
    const fv = props[field]
    if (op === '=') {
      if (typeof rhsVal === 'number') {
        const n = typeof fv === 'number' ? fv : Number(String(fv).replace(/,/g, ''))
        return Number.isFinite(n) && n === rhsVal
      }
      return String(fv ?? '').toLowerCase() === String(rhsVal).toLowerCase()
    }
    if (op === '<>' || op === '!=') {
      if (typeof rhsVal === 'number') {
        const n = typeof fv === 'number' ? fv : Number(String(fv).replace(/,/g, ''))
        return Number.isFinite(n) && n !== rhsVal
      }
      return String(fv ?? '').toLowerCase() !== String(rhsVal).toLowerCase()
    }
  }

  return null
}

function stripParens(s: string): string {
  let t = s.trim()
  while (t.startsWith('(') && t.endsWith(')')) t = t.slice(1, -1).trim()
  return t
}

/** Split on AND (top-level); each segment may contain OR → evalWhereExpr. */
function evalAndGroup(expr: string, props: Record<string, unknown>): boolean | null {
  const parts = splitTopLevel(stripParens(expr), ' AND ')
  let acc: boolean | null = null
  for (const raw of parts) {
    const p = stripParens(raw)
    const v = /\bOR\b/i.test(p) ? evalWhereExpr(p, props) : evalAtom(p, props)
    if (v == null) return null
    acc = acc == null ? v : acc && v
  }
  return acc
}

/** Split on OR (top-level); each segment is AND-group. */
export function evalWhereExpr(expr: string, props: Record<string, unknown>): boolean | null {
  const e = stripParens(expr)
  if (!e) return null
  const orParts = splitTopLevel(e, ' OR ')
  if (orParts.length === 1) return evalAndGroup(orParts[0]!, props)
  let anyOk: boolean | null = null
  for (const part of orParts) {
    const v = evalAndGroup(part, props)
    if (v == null) return null
    anyOk = anyOk == null ? v : anyOk || v
  }
  return anyOk
}

export function rowMatchesSqlWhere(whereSql: string, props: Record<string, unknown>): boolean {
  const v = evalWhereExpr(whereSql, props)
  return v === true
}
