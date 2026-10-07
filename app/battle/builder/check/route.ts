import { NextResponse } from 'next/server'
import { isBuilder } from '@/lib/battle/builder-auth'
import { parseSet } from '@/lib/battle/sets'
import { checkPuzzle } from '@/lib/battle/solver'
import { resolveSprites } from '@/lib/battle/sprites'
import { readDraft } from '@/lib/battle/draft'

// The checker can take several seconds on a long puzzle.
export const maxDuration = 60

// Runs the puzzle checker for the builder: every winning line, the luck test, and your answer played out.
export async function POST(request: Request) {
  if (!(await isBuilder())) {
    return NextResponse.json({ error: 'Builder is locked' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const draft = readDraft(body?.draft)
  if (!draft) {
    return NextResponse.json({ error: 'Invalid puzzle data' }, { status: 400 })
  }

  const sprites = await resolveSprites(parseSet(draft.player, 'Your Pokémon').set, parseSet(draft.opponent, 'Opponent').set)
  return NextResponse.json({ result: checkPuzzle(draft, draft.solution, sprites) })
}