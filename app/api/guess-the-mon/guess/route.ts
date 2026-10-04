import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllPokemonNames } from '@/lib/pokeapi'
import { calculatePoints } from '@/lib/guess-the-mon-config'
import {
  buildAllHintValues,
  getGuessTheMonData,
  loadGuessTheMon,
  saveGuessTheMonAttempt,
  toAnswerReveal,
  wrongGuessCount,
  type GuessEntry,
} from '@/lib/guess-the-mon'

function toSlug(rawName: string): string {
  return rawName.trim().toLowerCase().replace(/\s+/g, '-')
}

// Checks a guess. Wrong guesses add the penalty from lib/guess-the-mon-config.ts;
// a correct guess completes the puzzle and reveals the answer and every hint.
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
  const rawGuess = body?.guess

  if (typeof puzzleId !== 'string' || typeof rawGuess !== 'string' || rawGuess.trim().length === 0) {
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

  const guess = toSlug(rawGuess)

  // Only real Pokémon names count, so a typo never costs points.
  const pokemonNames = await getAllPokemonNames(supabase)
  if (!pokemonNames.includes(guess)) {
    return NextResponse.json({ error: `"${rawGuess}" isn't a recognized Pokémon name` }, { status: 400 })
  }

  if (attempt.guesses.some((g) => g.guess === guess)) {
    return NextResponse.json({ error: `You already guessed ${guess}` }, { status: 400 })
  }

  let data
  try {
    data = await getGuessTheMonData(answerSlug, supabase)
  } catch {
    return NextResponse.json({ error: "Couldn't check that guess, please try again" }, { status: 502 })
  }

  const correct = guess === data.speciesName
  const entry: GuessEntry = { guess, correct, guessed_at: new Date().toISOString() }
  const updated = {
    ...attempt,
    guesses: [...attempt.guesses, entry],
    completed: correct,
    succeeded: correct ? true : null,
  }

  const { error } = await saveGuessTheMonAttempt(supabase, puzzleId, user.id, updated)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    guess,
    correct,
    points: calculatePoints(updated.revealedHints, wrongGuessCount(updated)),
    answer: correct ? toAnswerReveal(data) : null,
    hints: correct ? buildAllHintValues(data) : null,
  })
}