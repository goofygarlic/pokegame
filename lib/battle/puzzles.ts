// Loading and saving battle puzzles and players' attempts.
// Puzzles live in the existing `puzzles` table with type 'battle' and no daily_date.
// Everything about the battle is in `content` (see BattlePuzzleContent).
// A player's attempt lives in `attempts`: `guesses` holds the moves they've picked.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describeChoices, parseSetup, runBattle } from './engine'
import { summarizeSet } from './sets'
import {
  AI_FLAGS,
  DIFFICULTIES,
  type BattlePuzzleContent,
  type BattlePuzzleInfo,
  type BattleReveal,
  type BattleSetup,
  type PlayerChoice,
} from './types'

export const BATTLE_TYPE = 'battle'

export interface StoredBattlePuzzle {
  id: string
  title: string
  description: string | null
  published: boolean
  content: BattlePuzzleContent
}

export function isBattleContent(value: unknown): value is BattlePuzzleContent {
  const c = value as BattlePuzzleContent | null
  return !!c && c.kind === 'battle-v1' && typeof c.player === 'string' && typeof c.opponent === 'string'
}

export function setupOf(content: BattlePuzzleContent): BattleSetup {
  return {
    player: content.player,
    opponent: content.opponent,
    opponentBehavior: content.opponentBehavior,
    maxTurns: content.maxTurns,
    allowTera: content.allowTera,
    seed: content.seed,
  }
}

// Players only ever see published puzzles. Pass the admin client and includeUnpublished from the builder.
export async function loadBattlePuzzle(
  supabase: SupabaseClient,
  puzzleId: string,
  includeUnpublished = false
): Promise<StoredBattlePuzzle | null> {
  const { data } = await supabase
    .from('puzzles')
    .select('id, type, title, description, published, content')
    .eq('id', puzzleId)
    .maybeSingle()

  if (!data || data.type !== BATTLE_TYPE || !isBattleContent(data.content)) return null
  if (!data.published && !includeUnpublished) return null
  return data as StoredBattlePuzzle
}

// Puzzle details for the game screen. Leaves out the answer, explanation and seed.
export function puzzleInfo(puzzle: StoredBattlePuzzle): BattlePuzzleInfo {
  const { content } = puzzle
  const parsed = parseSetup(setupOf(content))
  const behavior = content.opponentBehavior

  return {
    id: puzzle.id,
    title: puzzle.title,
    description: puzzle.description,
    difficulty: DIFFICULTIES.some((d) => d.id === content.difficulty) ? content.difficulty : 'medium',
    maxTurns: content.maxTurns,
    allowTera: content.allowTera,
    player: summarizeSet(parsed.player, content.sprites?.playerFront ?? content.sprites?.player ?? null),
    opponent: summarizeSet(parsed.opponent, content.sprites?.opponent ?? null),
    playerBackSprite: content.sprites?.player ?? null, opponentStyle:
      behavior.mode === 'ai'
        ? { mode: 'ai', flags: behavior.flags.map((f) => ({ label: AI_FLAGS[f].label, description: AI_FLAGS[f].description })) }
        : { mode: 'script' },
    formSprites: content.sprites?.forms ?? { player: {}, opponent: {} },
  }
}

export function buildReveal(content: BattlePuzzleContent): BattleReveal {
  return {
    solution: describeChoices(content.solution),
    explanation: content.explanation,
    solutionView: runBattle(setupOf(content), content.solution).view,
  }
}

export interface BattleAttempt {
  choices: PlayerChoice[]
  completed: boolean
  succeeded: boolean | null
}

export async function loadBattleAttempt(supabase: SupabaseClient, puzzleId: string, userId: string): Promise<BattleAttempt> {
  const { data, error } = await supabase
    .from('attempts')
    .select('guesses, completed, succeeded')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', userId)
    .maybeSingle()

  // Fail loudly rather than treating a read error as a fresh attempt.
  if (error) throw new Error(`Couldn't load attempt: ${error.message}`)

  const guesses: unknown[] = Array.isArray(data?.guesses) ? data.guesses : []
  return {
    choices: guesses.filter((g): g is PlayerChoice => typeof (g as PlayerChoice)?.move === 'string'),
    completed: data?.completed ?? false,
    succeeded: data?.succeeded ?? null,
  }
}

export async function saveBattleAttempt(supabase: SupabaseClient, puzzleId: string, userId: string, attempt: BattleAttempt) {
  return supabase.from('attempts').upsert(
    {
      puzzle_id: puzzleId,
      user_id: userId,
      guesses: attempt.choices,
      completed: attempt.completed,
      succeeded: attempt.succeeded,
      completed_at: attempt.completed ? new Date().toISOString() : null,
    },
    { onConflict: 'puzzle_id,user_id' }
  )
}