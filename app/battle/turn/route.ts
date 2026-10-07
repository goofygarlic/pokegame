import { NextResponse } from 'next/server'
import { toID } from '@pkmn/sim'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { runBattle } from '@/lib/battle/engine'
import { buildReveal, loadBattleAttempt, loadBattlePuzzle, saveBattleAttempt, setupOf } from '@/lib/battle/puzzles'

// Plays the player's move for the next turn. The battle is replayed from the start with every move they've picked so far, then the attempt is saved. Once the battle is won or lost, the answer and your explanation come back too.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  const limited = await rateLimit(request, 'battle', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const puzzleId = body?.puzzleId
  const move = body?.move
  if (typeof puzzleId !== 'string' || typeof move !== 'string' || move.trim().length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const puzzle = await loadBattlePuzzle(supabase, puzzleId)
  if (!puzzle) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const attempt = await loadBattleAttempt(supabase, puzzleId, user.id)
  if (attempt.completed) {
    return NextResponse.json({ error: 'Puzzle already completed' }, { status: 400 })
  }

  const choices = [...attempt.choices, { move: toID(move), tera: body?.tera === true, mega: body?.mega === true }]
  const { view, error } = runBattle(setupOf(puzzle.content), choices)
  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }

  const completed = view.outcome !== 'ongoing'
  const { error: saveError } = await saveBattleAttempt(supabase, puzzleId, user.id, {
    choices,
    completed,
    succeeded: view.outcome === 'win' ? true : view.outcome === 'loss' ? false : null,
  })
  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 })
  }

  return NextResponse.json({
    view,
    reveal: completed ? buildReveal(puzzle.content) : null,
  })
}