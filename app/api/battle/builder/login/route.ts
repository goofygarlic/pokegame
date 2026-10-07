import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { BUILDER_COOKIE, BUILDER_COOKIE_MAX_AGE, builderToken, secretMatches } from '@/lib/battle/builder-auth'

// Unlocks the puzzle builder in this browser when the secret matches BATTLE_BUILDER_SECRET.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const secret = typeof body?.secret === 'string' ? body.secret : ''
  const token = builderToken()

  if (!token) {
    return NextResponse.json({ error: 'BATTLE_BUILDER_SECRET is not set on the server.' }, { status: 500 })
  }
  if (!secretMatches(secret)) {
    // A short pause makes guessing the secret slow.
    await new Promise((resolve) => setTimeout(resolve, 800))
    return NextResponse.json({ error: "That's not the builder secret." }, { status: 401 })
  }

  ;(await cookies()).set(BUILDER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: BUILDER_COOKIE_MAX_AGE,
  })
  return NextResponse.json({ ok: true })
}

// Locks the builder again in this browser.
export async function DELETE() {
  ;(await cookies()).delete(BUILDER_COOKIE)
  return NextResponse.json({ ok: true })
}