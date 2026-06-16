/**
 * PWA / iOS icons from public/agrocloud-logo.png (requires sharp).
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const logoPath = path.join(pub, 'agrocloud-logo.png')

if (!fs.existsSync(logoPath)) {
  console.error('Missing', logoPath, '— run: node scripts/process-brand-logo.mjs')
  process.exit(1)
}

const splashBg = { r: 240, g: 253, b: 244, alpha: 1 }

for (const size of [192, 512]) {
  await sharp(logoPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(pub, `pwa-${size}x${size}.png`))
}

await sharp(logoPath)
  .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(pub, 'apple-touch-icon.png'))

for (const size of [152, 167]) {
  await sharp(logoPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(pub, `apple-touch-icon-${size}.png`))
}

const maskInner = 410
await sharp(logoPath)
  .resize(maskInner, maskInner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: splashBg,
  })
  .png()
  .toFile(path.join(pub, 'maskable-512x512.png'))

console.log(
  'Wrote PWA icons: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png, apple-touch-icon-152.png, apple-touch-icon-167.png, maskable-512x512.png',
)
