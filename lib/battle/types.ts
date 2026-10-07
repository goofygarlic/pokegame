// Shared types and settings for battle puzzles. No server imports, so the game screen, the puzzle builder and the server code can all use this file.

// BATTLE PUZZLE SETTINGS
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
] as const

// The longest puzzle the builder accepts. The checker tries every line up to this many turns, so keep it small (4 moves over 6 turns is already 4,096 lines).
export const MAX_PUZZLE_TURNS = 6

// How many extra random seeds each winning line is replayed on to spot luck (crits, misses, damage rolls, the AI breaking ties differently).
export const LUCK_TEST_SEEDS = 20

// Trainer AI flags, modelled on the AI flags trainers have in the main games (named after the AI_FLAG_* constants from the Gen 3 decompilation projects).
// Every usable move starts at 100 points, each flag adds or removes points, and the trainer uses the highest-scoring move. Ties are broken by a seeded coin flip.
export const AI_FLAGS = {
  checkBadMove: {
    label: 'Avoid bad moves',
    gameFlag: 'AI_FLAG_CHECK_BAD_MOVE',
    description: 'Skips moves that would fail or do nothing: immune targets, statusing a Pokémon that already has a status, stats already maxed, Endeavor when it would not help, Fake Out after the first turn.',
  },
  tryToFaint: {
    label: 'Go for the KO',
    gameFlag: 'AI_FLAG_TRY_TO_FAINT',
    description: 'Strongly prefers a move that knocks you out, and a priority move that does it when you are faster.',
  },
  checkViability: {
    label: 'Smart move choice',
    gameFlag: 'AI_FLAG_CHECK_VIABILITY',
    description: 'Prefers super-effective moves, avoids resisted ones, statuses healthy targets and heals when low.',
  },
  preferStrongest: {
    label: 'Use the strongest move',
    gameFlag: 'AI_FLAG_PREFER_STRONGEST_MOVE',
    description: 'Prefers whichever move does the most damage to you right now.',
  },
} as const

// The flags a new puzzle starts with in the builder.
export const DEFAULT_AI_FLAGS: AiFlag[] = ['checkBadMove', 'tryToFaint', 'preferStrongest']
// =============================================================================

export type Difficulty = (typeof DIFFICULTIES)[number]['id']
export type AiFlag = keyof typeof AI_FLAGS

export type OpponentBehavior =
  | { mode: 'ai'; flags: AiFlag[] } // trainer AI with the chosen flags (no flags = picks at random)
  | { mode: 'script'; moves: string[] } // one move per turn; the last one repeats

// One turn's choice for the player. `move` is a move id like "quickattack". `mega` Mega Evolves before moving (only if the Pokémon holds its Mega Stone).
export interface PlayerChoice {
  move: string
  tera?: boolean
  mega?: boolean
}

// How a line of choices is shown: "Mega Evolve + Flare Blitz", "Tera + Hyper Fang".
export interface ChoiceName {
  name: string
  tera: boolean
  mega: boolean
}

export function choiceLabel(c: ChoiceName): string {
  if (c.mega) return `Mega Evolve + ${c.name}`
  if (c.tera) return `Tera + ${c.name}`
  return c.name
}

// "Charizard-Mega-X" -> "Mega Charizard X", "Kyogre-Primal" -> "Primal Kyogre".
export function displaySpecies(species: string): string {
  const mega = /^(.+)-Mega(?:-([XYZ]))?$/.exec(species)
  if (mega) return `Mega ${mega[1]}${mega[2] ? ` ${mega[2]}` : ''}`
  const primal = /^(.+)-Primal$/.exec(species)
  if (primal) return `Primal ${primal[1]}`
  return species
}

// Everything that defines a puzzle's battle. Stored in puzzles.content (with the extras below).
export interface BattleSetup {
  player: string // Showdown export text for your Pokémon
  opponent: string // Showdown export text for the opponent
  opponentBehavior: OpponentBehavior
  maxTurns: number // you lose if you haven't won after this many turns
  allowTera: boolean
  seed: string // fixes damage rolls, crits and misses so the puzzle plays the same every time
}

export interface BattlePuzzleContent extends BattleSetup {
  kind: 'battle-v1'
  difficulty: Difficulty
  solution: PlayerChoice[] // the intended winning line
  explanation: string // shown after the puzzle ends
  sprites: BattleSprites
  createdAt: string
}

// player is your Pokémon from behind (for the battlefield); playerFront is for its info card. forms holds sprites for every form a Pokémon can change into mid-battle (Mega, Primal, Zen Mode, ...), keyed by Showdown species name: your side from behind, the opponent's from the front.
export interface BattleSprites {
  player: string | null
  opponent: string | null
  playerFront?: string | null
  forms?: { player: Record<string, string | null>; opponent: Record<string, string | null> }
}

export interface MoveInfo {
  id: string
  name: string
  type: string
  category: 'Physical' | 'Special' | 'Status'
  basePower: number
  accuracy: number | true
  priority: number
  pp: number
  maxpp: number
  disabled: boolean
  description: string
}

// What a held Mega Stone or Primal orb turns a Pokémon into.
export interface TransformSummary {
  kind: 'mega' | 'primal'
  species: string // Showdown name, e.g. "Charizard-Mega-X"
  types: string[]
  ability: string
  stats: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
}

// A Pokémon's set as the player sees it in the scouting report.
export interface SetSummary {
  species: string
  level: number
  item: string | null
  ability: string | null
  nature: string
  teraType: string | null
  types: string[]
  stats: Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  moves: MoveInfo[]
  spriteUrl: string | null
  transform: TransformSummary | null
}

export interface MonState {
  species: string
  level: number
  hp: number
  maxhp: number
  status: string | null // 'par', 'brn', 'psn', 'tox', 'slp', 'frz'
  types: string[]
  teraType: string | null // set once terastallized
  item: string | null
  boosts: Record<string, number> // only non-zero stages
}

export interface BattleEvent {
  turn: number
  kind: 'turn' | 'move' | 'info' | 'result'
  text: string
  hp?: { side: 'player' | 'opponent'; hp: number; maxhp: number }
  forme?: { side: 'player' | 'opponent'; species: string } // the Pokémon changed form (Mega, Primal, Zen Mode, ...)
}

export type BattleOutcome = 'win' | 'loss' | 'ongoing'

export interface BattleView {
  events: BattleEvent[]
  player: MonState
  opponent: MonState
  turnsPlayed: number
  maxTurns: number
  outcome: BattleOutcome
  lossReason: string | null
  moves: MoveInfo[] // the moves you can pick this turn
  canTera: string | null // your Tera type, while you can still terastallize
  canMega: string | null // the form you'd Mega Evolve into, while you still can
}

// Shown once the puzzle is over.
export interface BattleReveal {
  solution: ChoiceName[]
  explanation: string
  solutionView: BattleView // the winning line played out, for "Watch the solution"
}

export function difficultyLabel(id: string): string {
  return DIFFICULTIES.find((d) => d.id === id)?.label ?? id
}

export function randomSeed(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `sodium,${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

// What the builder sends to the server when checking or saving a puzzle.
export interface BattleDraft extends BattleSetup {
  title: string
  description: string // the briefing shown above the battle
  difficulty: Difficulty
  solution: PlayerChoice[]
  explanation: string
  published: boolean
}

// What the game screen gets about a puzzle (never the answer).
export interface BattlePuzzleInfo {
  id: string
  title: string
  description: string | null
  difficulty: Difficulty
  maxTurns: number
  allowTera: boolean
  player: SetSummary
  opponent: SetSummary
  playerBackSprite: string | null // your Pokémon on the battlefield, seen from behind
  formSprites: { player: Record<string, string | null>; opponent: Record<string, string | null> }
  opponentStyle: { mode: 'ai'; flags: { label: string; description: string }[] } | { mode: 'script' }
}