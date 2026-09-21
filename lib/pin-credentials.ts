import { createHash, randomInt } from 'node:crypto'

// UI credentials remain two four-digit PINs. This encoding is NOT additional
// entropy or a substitute for rate limiting; it avoids the Auth password-length
// policy coupling. Never send this internal value to a client or log it.
export function pinPassword(teamPin: string, userPin: string): string {
  if (!/^\d{4}$/.test(teamPin) || !/^\d{4}$/.test(userPin)) throw new Error('Invalid PIN format')
  return createHash('sha256').update('count-stock/pin/v1:' + teamPin + ':' + userPin).digest('hex').slice(0, 60) + 'aA1!'
}

export function generatePin(exclude: Set<string>): string {
  if (exclude.size >= 9000) throw new Error('PIN capacity reached')
  let pin: string
  do { pin = String(randomInt(1000, 10000)) } while (exclude.has(pin))
  exclude.add(pin)
  return pin
}
