import { Fragment, type ReactNode } from 'react'

/** **bold** and *italic* inline marks (no HTML is ever injected). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    out.push(
      token.startsWith('**') ? (
        <strong key={`${keyBase}-${i++}`}>{token.slice(2, -2)}</strong>
      ) : (
        <em key={`${keyBase}-${i++}`}>{token.slice(1, -1)}</em>
      ),
    )
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Minimal Markdown: # / ## / ### headings, - or * lists, paragraphs, **bold**, *italic*. */
export function BuilderText({ source }: { source: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flushList = (key: string) => {
    if (!list.length) return
    blocks.push(
      <ul key={key}>
        {list.map((item, i) => (
          <li key={i}>{inline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    )
    list = []
  }
  source.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trimEnd()
    const item = line.match(/^\s*[-*]\s+(.*)$/)
    if (item) {
      list.push(item[1]!)
      return
    }
    flushList(`l${idx}`)
    if (!line.trim()) return
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1]!.length
      const content = inline(h[2]!, `h${idx}`)
      blocks.push(
        level === 1 ? <h3 key={idx}>{content}</h3> : level === 2 ? <h4 key={idx}>{content}</h4> : <h5 key={idx}>{content}</h5>,
      )
      return
    }
    blocks.push(<p key={idx}>{inline(line, `p${idx}`)}</p>)
  })
  flushList('end')
  return <Fragment>{blocks}</Fragment>
}
