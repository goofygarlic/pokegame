import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Feedback = 'correct' | 'present' | 'absent'


function scoreGuess(guess: string, answer: string): Feedback[] {
  const g = guess.toLowerCase().split('')
  const a = answer.toLowerCase().split('')
  const result: Feedback[] = new Array(a.length).fill('absent')
  const usedInAnswer: boolean[] = new Array(a.length).fill(false)

  // Pass 1: exact position matches
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = 'correct'
      usedInAnswer[i] = true
    }
  }

  // Pass 2: right letter, wrong position (respecting letter counts)
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue
    const matchIndex = a.findIndex(
      (letter, j) => letter === g[i] && !usedInAnswer[j]
    )
    if (matchIndex !== -1) {
      result[i] = 'present'
      usedInAnswer[matchIndex] = true
    }
  }

  return result
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { puzzleId, guess } = await request.json()

  if (!puzzleId || typeof guess !== 'string' || guess.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // fetch the puzzle (RLS already ensures only published puzzles are readable, so no extra check needed here).
  const { data: puzzle, error: puzzleError } = await supabase
    .from('puzzles')
    .select('id, type, content')
    .eq('id', puzzleId)
    .single()

  if (puzzleError || !puzzle || puzzle.type !== 'pokedle') {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const answer: string = puzzle.content.answer_species
  const maxGuesses: number = puzzle.content.max_guesses ?? 6

  if (guess.length !== answer.length) {
    return NextResponse.json(
      { error: `Guess must be ${answer.length} letters` },
      { status: 400 }
    )
  }

  // find or create user's attempt row for puzzle.
  const { data: existingAttempt } = await supabase
    .from('attempts')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingAttempt?.completed) {
    return NextResponse.json(
      { error: 'Puzzle already completed', completed: true },
      { status: 400 }
    )
  }

  const priorGuesses = existingAttempt?.guesses ?? []

  if (priorGuesses.length >= maxGuesses) {
    return NextResponse.json(
      { error: 'No guesses remaining', completed: true },
      { status: 400 }
    )
  }

  const feedback = scoreGuess(guess, answer)
  const succeeded = feedback.every((f) => f === 'correct')
  const newGuesses = [
    ...priorGuesses,
    { guess: guess.toLowerCase(), feedback, guessed_at: new Date().toISOString() },
  ]
  const completed = succeeded || newGuesses.length >= maxGuesses

  const attemptPayload = {
    puzzle_id: puzzleId,
    user_id: user.id,
    guesses: newGuesses,
    completed,
    succeeded: completed ? succeeded : null,
    completed_at: completed ? new Date().toISOString() : null,
  }

  const { error: upsertError } = await supabase
    .from('attempts')
    .upsert(attemptPayload, { onConflict: 'puzzle_id,user_id' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({
    feedback,
    completed,
    succeeded,
    guessesUsed: newGuesses.length,
    maxGuesses,
    // only reveal answer once puzzle is fr over.
    answer: completed ? answer : undefined,
  })
}