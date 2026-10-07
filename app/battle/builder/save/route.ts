import { NextResponse } from 'next/server'
import { ADMIN_USER_ID } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBuilder } from '@/lib/battle/builder-auth'
import { readDraft } from '@/lib/battle/draft'
import { parseSetup, PuzzleSetupError, runBattle } from '@/lib/battle/engine'
import { BATTLE_TYPE, loadBattlePuzzle } from '@/lib/battle/puzzles'
import { resolveSprites } from '@/lib/battle/sprites'
import type { BattlePuzzleContent } from '@/lib/battle/types'

// Creates a puzzle, or updates one when `id` is sent. Refuses to save a puzzle whose answer doesn't actually win.
export async function POST(request: Request) {
  if (!(await isBuilder())) {
    return NextResponse.json({ error: 'Builder is locked' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const draft = readDraft(body?.draft)
  const id: string | null = typeof body?.id === 'string' && body.id ? body.id : null
  if (!draft) {
    return NextResponse.json({ error: 'Invalid puzzle data' }, { status: 400 })
  }
  if (!draft.title.trim()) {
    return NextResponse.json({ error: 'Give the puzzle a title.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = parseSetup(draft)
  } catch (err) {
    const message = err instanceof PuzzleSetupError ? err.errors.join(' ') : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (draft.solution.length === 0) {
    return NextResponse.json({ error: 'Pick the answer first (run Check and choose a winning line).' }, { status: 400 })
  }
  const run = runBattle(draft, draft.solution)
  if (run.error || run.view.outcome !== 'win') {
    return NextResponse.json({ error: `Your answer doesn't win: ${run.error ?? run.view.lossReason ?? 'the battle is not over'}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const existing = id ? await loadBattlePuzzle(admin, id, true) : null
  if (id && !existing) {
    return NextResponse.json({ error: 'Puzzle to update not found' }, { status: 404 })
  }

  const content: BattlePuzzleContent = {
    kind: 'battle-v1',
    player: draft.player.trim(),
    opponent: draft.opponent.trim(),
    opponentBehavior: draft.opponentBehavior,
    maxTurns: draft.maxTurns,
    allowTera: draft.allowTera,
    seed: draft.seed,
    difficulty: draft.difficulty,
    solution: draft.solution,
    explanation: draft.explanation.trim(),
    sprites: await resolveSprites(parsed.player, parsed.opponent),
    createdAt: existing?.content.createdAt ?? new Date().toISOString(),
  }

  const row = {
    type: BATTLE_TYPE,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    published: draft.published,
    content,
  }

  const { data, error } = id
    ? await admin.from('puzzles').update(row).eq('id', id).select('id').single()
    : await admin
        .from('puzzles')
        .insert({ ...row, creator_id: ADMIN_USER_ID, daily_date: null })
        .select('id')
        .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Save failed' }, { status: 500 })
  }
  return NextResponse.json({ id: data.id })
}