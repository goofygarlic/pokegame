// Rate limiting for the game API routes. Counts are stored in Supabase
// (see the check_rate_limit SQL function), so the limits hold across every
// Vercel server instance instead of resetting whenever one restarts.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// =============================================================================
//  RATE LIMITS: TUNE HERE
//  `limit` requests are allowed per `windowSeconds`. Per-player limits use the
//  player's ID; the IP limit covers all game API calls from one network.
// =============================================================================
export const RATE_LIMITS = {
  guess: { limit: 20, windowSeconds: 60 }, // Pokédle and Guess the Pokémon guesses, per player
  hint: { limit: 20, windowSeconds: 60 }, // Guess the Pokémon hint reveals, per player
  cry: { limit: 30, windowSeconds: 60 }, // cry audio requests, per player
  ip: { limit: 120, windowSeconds: 60 }, // every game API call combined, per IP address
} as const

type PlayerBucket = Exclude<keyof typeof RATE_LIMITS, 'ip'>
type Check = { key: string; limit: number; windowSeconds: number }

function clientIp(request: Request): string | null {
  // Vercel puts the real client IP first in x-forwarded-for.
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')
}

function secondsUntilWindowEnds(windowSeconds: number): number {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return windowSeconds - (nowSeconds % windowSeconds)
}

// Returns a 429 response if the caller is over a limit, or null if the request may continue.
// If the check itself fails (database hiccup, missing secret key in local dev), the
// request is allowed, so a limiter problem never blocks people from playing.
export async function rateLimit(request: Request, bucket: PlayerBucket, userId: string): Promise<NextResponse | null> {
  try {
    const admin = createAdminClient()
    const checks: Check[] = [{ key: `${bucket}:user:${userId}`, ...RATE_LIMITS[bucket] }]

    const ip = clientIp(request)
    if (ip) checks.push({ key: `api:ip:${ip}`, ...RATE_LIMITS.ip })

    const results = await Promise.all(
      checks.map(async (check) => {
        const { data, error } = await admin.rpc('check_rate_limit', {
          p_key: check.key,
          p_limit: check.limit,
          p_window_seconds: check.windowSeconds,
        })
        if (error) throw new Error(error.message)
        return { allowed: data === true, windowSeconds: check.windowSeconds }
      })
    )

    const blocked = results.find((r) => !r.allowed)
    if (!blocked) return null

    return NextResponse.json(
      { error: 'Too many requests. Please slow down and try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(secondsUntilWindowEnds(blocked.windowSeconds)) } }
    )
  } catch (err) {
    console.error('Rate limit check failed, allowing request:', err instanceof Error ? err.message : err)
    return null
  }
}