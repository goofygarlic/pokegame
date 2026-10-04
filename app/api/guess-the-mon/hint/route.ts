import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculatePoints, isHintKey } from '@/lib/guess-the-mon-config'
import {
  buildHintValue,
  getGuessTheMonData,
  loadGuessTheMon,
  saveGuessTheMonAttempt,
  wrongGuessCount,
} from '@/lib/guess-the-mon'

// Reveals one hint. The hint's cost is charged the first time it's revealed;
// asking again for an already-revealed hint is free.
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const puzzleId = body?.puzzleId
  const hint = body?.hint

  if (typeof puzzleId !== 'string' || !isHintKey(hint)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const loaded = await loadGuessTheMon(supabase, puzzleId, user.id)
  if (!loaded) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const { answerSlug, attempt } = loaded

  if (attempt.completed) {
    return NextResponse.json({ error: 'Puzzle already completed' }, { status: 400 })
  }

  // Load the data before saving, so a PokeAPI hiccup never charges the player.
  let data
  try {
    data = await getGuessTheMonData(answerSlug, supabase)
  } catch {
    return NextResponse.json({ error: "Couldn't load that hint, please try again" }, { status: 502 })
  }

  const alreadyRevealed = attempt.revealedHints.includes(hint)
  const revealedHints = alreadyRevealed ? attempt.revealedHints : [...attempt.revealedHints, hint]

  if (!alreadyRevealed) {
    const { error } = await saveGuessTheMonAttempt(supabase, puzzleId, user.id, { ...attempt, revealedHints })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    hint,
    value: buildHintValue(hint, data),
    revealedHints,
    points: calculatePoints(revealedHints, wrongGuessCount(attempt)),
  })
}