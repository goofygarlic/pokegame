import { NextResponse } from 'next/server'
import { toID } from '@pkmn/sim'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { runBattle } from '@/lib/battle/engine'
import { loadBattleAttempt, loadBattlePuzzle, setupOf } from '@/lib/battle/puzzles'
import type { PlayerChoice } from '@/lib/battle/types'

// Replays a puzzle for practice after the real attempt is over. Nothing is saved, and it's locked until the puzzle is finished so it can't be used to test lines first.
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
  const raw: unknown = body?.choices
  if (typeof puzzleId !== 'string' || !Array.isArray(raw) || raw.length > 20) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const choices: PlayerChoice[] = []
  for (const item of raw) {
    const move = (item as PlayerChoice)?.move
    if (typeof move !== 'string') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    choices.push({ move: toID(move), tera: (item as PlayerChoice).tera === true, mega: (item as PlayerChoice).mega === true })
  }

  const puzzle = await loadBattlePuzzle(supabase, puzzleId)
  if (!puzzle) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const attempt = await loadBattleAttempt(supabase, puzzleId, user.id)
  if (!attempt.completed) {
    return NextResponse.json({ error: 'Finish the puzzle before practicing it' }, { status: 403 })
  }

  const { view, error } = runBattle(setupOf(puzzle.content), choices)
  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }
  return NextResponse.json({ view })
}