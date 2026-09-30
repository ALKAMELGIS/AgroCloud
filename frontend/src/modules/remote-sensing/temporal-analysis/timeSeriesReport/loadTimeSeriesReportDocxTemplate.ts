import templateUrl from './templates/Agricultural_Satellite_Intelligence_Report.template.docx?url'

/** Loads the shared Word report shell (browser via Vite asset URL; Node/vitest via filesystem). */
export async function loadTimeSeriesReportDocxTemplate(): Promise<ArrayBuffer> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const path = join(dir, 'templates', 'Agricultural_Satellite_Intelligence_Report.template.docx')
    const buf = await readFile(path)
    return Uint8Array.from(buf).buffer
  }

  const res = await fetch(templateUrl)
  if (!res.ok) throw new Error('Failed to load Word report template')
  return await res.arrayBuffer()
}
