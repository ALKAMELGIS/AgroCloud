/**
 * One-off: copy brand PNG, remove near-white background, write agrocloud-logo.png.
 * Usage: node scripts/process-brand-logo.mjs <source.png>
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
if (!process.argv[2]) {
  console.error('Usage: node scripts/process-brand-logo.mjs <source.png>')
  process.exit(1)
}
const src = path.resolve(process.argv[2])
const out = path.join(pub, 'agrocloud-logo.png')

if (!fs.existsSync(src)) {
  console.error('Missing source:', src)
  process.exit(1)
}

const THRESHOLD = 248

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

for (let i = 0; i < data.length; i += 4) {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
    data[i + 3] = 0
  }
}

await sharp(data, { raw: info }).png().toFile(out)
console.log('Wrote', out, `(${info.width}x${info.height}, transparent background)`)

const coreOut = path.join(pub, 'agrocloud-logo-core.png')
const top = Math.floor(info.height * 0.22)
const coreH = info.height - top
await sharp(out)
  .extract({ left: 0, top, width: info.width, height: coreH })
  .png()
  .toFile(coreOut)
console.log('Wrote', coreOut, `(leaves + ring, no baked drone)`)
