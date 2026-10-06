import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { getGuessOptions } from '@/lib/pokeapi'
import { MATCH_ANY_FORM } from '@/lib/pokemon-forms'
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
  const limited = await rateLimit(request, 'guess', user.id)
  if (limited) return limited

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

  // Only species and allowed forms from the dropdown count, so a typo never costs points.
  const options = await getGuessOptions(supabase)
  const option = options.find((o) => o.value === guess)
  if (!option) {
    return NextResponse.json({ error: `"${rawGuess}" isn't a recognized Pokémon name` }, { status: 400 })
  }

  if (attempt.guesses.some((g) => g.guess === option.value)) {
    return NextResponse.json({ error: `You already guessed ${option.label}` }, { status: 400 })
  }

  // When any form counts, a second form of a species already guessed wrong can't be right
  // either, so don't let it cost points.
  if (MATCH_ANY_FORM) {
    const speciesOf = new Map(options.map((o) => [o.value, o.species]))
    if (attempt.guesses.some((g) => (speciesOf.get(g.guess) ?? g.guess) === option.species)) {
      return NextResponse.json({ error: `You already ruled out ${option.species}` }, { status: 400 })
    }
  }

  let data
  try {
    data = await getGuessTheMonData(answerSlug, supabase)
  } catch {
    return NextResponse.json({ error: "Couldn't check that guess, please try again" }, { status: 502 })
  }

  // MATCH_ANY_FORM (lib/pokemon-forms.ts): any form of the answer's species counts.
  // Otherwise the exact form has to be picked.
  const correct = MATCH_ANY_FORM ? option.species === data.speciesName : option.label === data.label
  const entry: GuessEntry = { guess: option.value, correct, guessed_at: new Date().toISOString() }
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
    guess: option.value,
    guessLabel: option.label, // e.g. "darmanitan (galarian standard)", for the wrong-guess chips
    correct,
    points: calculatePoints(updated.revealedHints, wrongGuessCount(updated)),
    answer: correct ? toAnswerReveal(data) : null,
    hints: correct ? buildAllHintValues(data) : null,
  })
}