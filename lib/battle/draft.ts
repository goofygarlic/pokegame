// The puzzle builder's form data: the starting template, and the check that turns whatever the browser sent into a clean BattleDraft. No server imports, so the builder component can use the template too.

import {
  AI_FLAGS,
  DEFAULT_AI_FLAGS,
  DIFFICULTIES,
  MAX_PUZZLE_TURNS,
  type AiFlag,
  type BattleDraft,
  type Difficulty,
  type OpponentBehavior,
  type PlayerChoice,
} from './types'

// Same as Showdown's toID: "Quick Attack" -> "quickattack".
export function toMoveId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

//  What the builder starts with when you press "New puzzle".
export const TEMPLATE_DRAFT: BattleDraft = {
  title: 'David and Goliath',
  description: 'A level 1 Rattata against a level 100 Mewtwo. Find the only way to win.',
  difficulty: 'easy',
  player: `Rattata @ Focus Sash
Level: 1
- Endeavor
- Quick Attack`,
  opponent: `Mewtwo
Level: 100
- Psystrike
- Aura Sphere
- Recover
- Ice Beam`,
  opponentBehavior: { mode: 'ai', flags: DEFAULT_AI_FLAGS },
  maxTurns: 2,
  allowTera: false,
  seed: 'sodium,00000000000000000000000000000001',
  solution: [{ move: 'endeavor' }, { move: 'quickattack' }],
  explanation:
    "Mewtwo is faster, so it attacks first, but Focus Sash leaves Rattata at 1 HP. Endeavor then cuts Mewtwo down to Rattata's HP, which is also 1. Next turn, Quick Attack's +1 priority lets Rattata move before Mewtwo and finish it off.",
  published: false,
}

function str(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function readBehavior(value: unknown): OpponentBehavior {
  const v = value as { mode?: string; flags?: unknown; moves?: unknown } | null
  if (v?.mode === 'script') {
    const moves = Array.isArray(v.moves) ? v.moves.map((m) => str(m, 40).trim()).filter(Boolean).slice(0, 20) : []
    return { mode: 'script', moves }
  }
  const flags = Array.isArray(v?.flags) ? v.flags.filter((f): f is AiFlag => typeof f === 'string' && f in AI_FLAGS) : []
  return { mode: 'ai', flags: Array.from(new Set(flags)) }
}

function readChoices(value: unknown): PlayerChoice[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_PUZZLE_TURNS)
    .map((c) => ({
      move: toMoveId(str((c as PlayerChoice)?.move, 40)),
      tera: (c as PlayerChoice)?.tera === true,
      mega: (c as PlayerChoice)?.mega === true,
    }))
    .filter((c) => c.move.length > 0)
    .map((c) => ({ move: c.move, ...(c.tera ? { tera: true } : {}), ...(c.mega ? { mega: true } : {}) }))
}

// Returns null if the data is too broken to use.
export function readDraft(value: unknown): BattleDraft | null {
  const v = value as Partial<BattleDraft> | null
  if (!v || typeof v !== 'object') return null

  const difficulty: Difficulty = DIFFICULTIES.some((d) => d.id === v.difficulty) ? (v.difficulty as Difficulty) : 'medium'
  const maxTurns = Math.round(Number(v.maxTurns))
  const seed = str(v.seed, 80).trim()

  return {
    title: str(v.title, 120),
    description: str(v.description, 600),
    difficulty,
    player: str(v.player),
    opponent: str(v.opponent),
    opponentBehavior: readBehavior(v.opponentBehavior),
    maxTurns: Number.isFinite(maxTurns) ? maxTurns : 0,
    allowTera: v.allowTera === true,
    seed: /^sodium,[0-9a-f]{32}$/.test(seed) ? seed : 'sodium,00000000000000000000000000000001',
    solution: readChoices(v.solution),
    explanation: str(v.explanation, 3000),
    published: v.published === true,
  }
}