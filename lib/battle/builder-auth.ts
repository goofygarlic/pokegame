// Locks the battle puzzle builder to me.
//
// Set BATTLE_BUILDER_SECRET in Vercel (and .env.local for local dev). Entering it
// once on /battle/builder stores a cookie in that browser for 30 days, so it works
// on any device without needing an account. With no secret set, the builder stays locked.

import { createHash, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const BUILDER_COOKIE = 'battle_builder'
export const BUILDER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// The cookie holds a hash of the secret, never the secret itself.
export function builderToken(): string | null {
  const secret = process.env.BATTLE_BUILDER_SECRET
  if (!secret) return null
  return createHash('sha256').update(`pokegame-battle-builder:${secret}`).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function secretMatches(attempt: string): boolean {
  const secret = process.env.BATTLE_BUILDER_SECRET
  return !!secret && safeEqual(attempt, secret)
}

export async function isBuilder(): Promise<boolean> {
  // Read the cookie first, even without a secret set, so Next.js always renders
  // the builder per request instead of freezing it as a static page at build time.
  const value = (await cookies()).get(BUILDER_COOKIE)?.value
  const token = builderToken()
  return !!token && !!value && safeEqual(value, token)
}