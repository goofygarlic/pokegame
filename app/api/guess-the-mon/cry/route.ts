import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { getGuessTheMonData, loadGuessTheMon } from '@/lib/guess-the-mon'

// Streams the answer's cry through our own server. The original file URL
// contains the Pokédex number, so sending it to the browser would give the answer away.
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  const limited = await rateLimit(request, 'guess', user.id)
  if (limited) return limited

  const puzzleId = new URL(request.url).searchParams.get('puzzleId')
  if (!puzzleId) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const loaded = await loadGuessTheMon(supabase, puzzleId, user.id)
  if (!loaded) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const { answerSlug, attempt } = loaded

  // The cry has to be paid for first (or the puzzle already solved).
  if (!attempt.revealedHints.includes('cry') && !attempt.completed) {
    return NextResponse.json({ error: 'Reveal the cry hint first' }, { status: 403 })
  }

  let cryUrl: string | null = null
  try {
    cryUrl = (await getGuessTheMonData(answerSlug, supabase)).cryUrl
  } catch {
    return NextResponse.json({ error: "Couldn't load the cry" }, { status: 502 })
  }

  if (!cryUrl) {
    return NextResponse.json({ error: 'No cry available' }, { status: 404 })
  }

  const upstream = await fetch(cryUrl)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Couldn't load the cry" }, { status: 502 })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'audio/ogg',
      'Cache-Control': 'private, no-store',
    },
  })
}