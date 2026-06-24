#!/usr/bin/env node
/**
 * SMTP connectivity test (loads .env.production).
 * Usage: node scripts/test-smtp.mjs recipient@example.com
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { loadProductionEnv } = await import(
  pathToFileURL(path.join(repoRoot, 'backend/server/loadProductionEnv.js')).href
)
const { hasSmtpConfig, readSmtpEnv, sendMailWithFallback } = await import(
  pathToFileURL(path.join(repoRoot, 'backend/server/smtpTransport.js')).href
)

loadProductionEnv()

const cfg = readSmtpEnv()
const to = String(process.argv[2] || cfg.user).trim()

if (!hasSmtpConfig()) {
  console.error('Missing SMTP_HOST, SMTP_USER, or SMTP_PASS.')
  process.exit(1)
}

try {
  const { info, host } = await sendMailWithFallback(
    {
      to,
      subject: 'Agro Cloud — SMTP test',
      text: 'SMTP is configured correctly. Verification emails should work.',
      html: '<p>SMTP is configured correctly. Verification emails should work.</p>',
    },
    process.env,
  )
  console.log('OK — sent via', host, 'to', to, info.messageId ? `(${info.messageId})` : '')
} catch (error) {
  console.error('SMTP failed:', error?.message || error)
  console.error('')
  console.error('Hostinger checklist:')
  console.error('  1. Reset password: Hostinger → Emails → admin@eliteagrocloud.com')
  console.error('  2. Server: smtp.hostinger.com port 465 SSL (per Hostinger panel)')
  console.error('  3. Titan webmail → Settings → Enable Titan on other apps')
  process.exit(1)
}
