import nodemailer from 'nodemailer'

const HOSTINGER_SMTP_HOSTS = ['smtp.hostinger.com', 'smtp.titan.email']

export function readSmtpEnv(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim()
  const port = Number(env.SMTP_PORT || 465)
  const secure = String(env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465
  const user = String(env.SMTP_USER || '').trim()
  const pass = String(env.SMTP_PASS || '').trim()
  const from = String(env.SMTP_FROM || user || 'noreply@agri-cloud.local').trim()
  return { host, port, secure, user, pass, from }
}

export function hasSmtpConfig(env = process.env) {
  const { host, port, user, pass } = readSmtpEnv(env)
  return Boolean(host && port && user && pass)
}

export function smtpHostCandidates(preferredHost) {
  const ordered = [preferredHost, ...HOSTINGER_SMTP_HOSTS].filter(Boolean)
  return [...new Set(ordered.map(h => String(h).trim()).filter(Boolean))]
}

export function createSmtpTransport({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    ...(port === 587 && !secure ? { requireTLS: true } : {}),
  })
}

/**
 * Send mail; tries alternate Hostinger/Titan SMTP hosts on auth failure.
 */
export async function sendMailWithFallback({ to, subject, text, html }, env = process.env) {
  const cfg = readSmtpEnv(env)
  if (!hasSmtpConfig(env)) {
    throw new Error('smtp_not_configured')
  }

  const hosts = smtpHostCandidates(cfg.host)
  let lastError = null

  for (const host of hosts) {
    const transporter = createSmtpTransport({ ...cfg, host })
    try {
      await transporter.verify()
      const info = await transporter.sendMail({
        from: cfg.from,
        to,
        subject,
        text,
        html,
      })
      return { info, host }
    } catch (error) {
      lastError = error
      const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : ''
      const authFailed = /535|authentication failed|invalid login/i.test(message)
      if (!authFailed || host === hosts[hosts.length - 1]) {
        throw error
      }
    }
  }

  throw lastError || new Error('send_failed')
}
