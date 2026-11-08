/**
 * Print the first port from <start> (default 3011) that nothing answers on, checking both
 * 127.0.0.1 and ::1 — `localhost` may resolve to either, so a port taken on one would make the
 * browser reach the other program. Used by start-agrocloud.cmd.
 *   node core/scripts/windows/find-free-port.mjs [start] [tries]
 */
import net from 'node:net'

const start = Number(process.argv[2] || 3011)
const tries = Number(process.argv[3] || 30)

function answers(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (busy) => {
      socket.destroy()
      resolve(busy)
    }
    socket.setTimeout(400, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

for (let port = start; port < start + tries; port++) {
  const [v4, v6] = await Promise.all([answers('127.0.0.1', port), answers('::1', port)])
  if (!v4 && !v6) {
    console.log(port)
    process.exit(0)
  }
}
console.error(`No free port between ${start} and ${start + tries - 1}.`)
process.exit(1)
