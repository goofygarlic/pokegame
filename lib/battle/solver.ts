// The puzzle checker used by the builder.
// 1. Tries every possible line of moves (and Tera, if allowed) up to the turn limit and records every line that wins.
// 2. Replays each winning line on extra random seeds. A line that only wins on some seeds depends on luck (a crit, a miss, a damage roll, or the AI breaking a tie).

import { createHash } from 'node:crypto'
import { Battle } from '@pkmn/sim'
import { explainScores } from './ai'
import { describeChoices, parseSetup, playTurn, PLAYER_NAME, PuzzleSetupError, runBattle, startBattle } from './engine'
import { summarizeSet } from './sets'
import {
  LUCK_TEST_SEEDS,
  MAX_PUZZLE_TURNS,
  choiceLabel,
  type BattleSetup,
  type BattleSprites,
  type BattleView,
  type PlayerChoice,
  type SetSummary,
  type ChoiceName,
} from './types'


const MAX_BATTLES = 6000
const MAX_MILLISECONDS = 20000
const MAX_LINES_LUCK_TESTED = 12

export interface CheckedLine {
  choices: PlayerChoice[]
  names: ChoiceName[]
  turns: number
  seedWins: number // out of seedsTried, including the puzzle's own seed
  seedsTried: number
}

export interface CheckResult {
  errors: string[]
  warnings: string[]
  player: SetSummary | null
  opponent: SetSummary | null
  solutions: CheckedLine[]
  battlesRun: number
  complete: boolean
  intended: (CheckedLine & { wins: boolean; view: BattleView }) | null
  firstTurnAi: { move: string; score: number }[]
}

// Extra seeds derived from the puzzle's seed, so a re-check gives the same numbers.
export function luckSeeds(seed: string, count = LUCK_TEST_SEEDS): string[] {
  return Array.from({ length: count }, (_, i) => {
    const hex = createHash('sha256').update(`${seed}:luck:${i}`).digest('hex').slice(0, 32)
    return `sodium,${hex}`
  })
}

function luckTest(setup: BattleSetup, choices: PlayerChoice[]): { seedWins: number; seedsTried: number } {
  const seeds = [setup.seed, ...luckSeeds(setup.seed)]
  let seedWins = 0
  for (const seed of seeds) {
    const { view, error } = runBattle(setup, choices, seed)
    // On another seed a choice can become impossible (e.g. the move got disabled); that counts as a loss.
    if (!error && view.outcome === 'win') seedWins++
  }
  return { seedWins, seedsTried: seeds.length }
}

// Every choice the player could make this turn: each usable move, with and without Tera.
   // Every choice the player could make this turn: each usable move, plain, with Tera
   // (if the puzzle allows it) and with Mega Evolution (if holding the Mega Stone).
function choicesFor(battle: Battle, setup: BattleSetup): PlayerChoice[] {
    const request = battle.p1.activeRequest as {
    active?: { moves: { id: string; disabled?: boolean | string }[]; canTerastallize?: string; canMegaEvo?: boolean }[]
    } | null
    const active = request?.active?.[0]
    if (!active) return []
    return active.moves.flatMap((m) => {
    if (m.disabled) return []
    const options: PlayerChoice[] = [{ move: m.id }]
    if (setup.allowTera && active.canTerastallize) options.push({ move: m.id, tera: true })
    if (active.canMegaEvo) options.push({ move: m.id, mega: true })
    return options
    })
}

function sameLine(a: PlayerChoice[], b: PlayerChoice[]): boolean {
    return a.length === b.length && a.every((c, i) => c.move === b[i].move && !!c.tera === !!b[i].tera && !!c.mega === !!b[i].mega)
}

export function checkPuzzle(
  setup: BattleSetup,
  intended: PlayerChoice[],
  sprites: BattleSprites
): CheckResult {
  const result: CheckResult = {
    errors: [],
    warnings: [],
    player: null,
    opponent: null,
    solutions: [],
    battlesRun: 0,
    complete: true,
    intended: null,
    firstTurnAi: [],
  }

  let parsed
  try {
    parsed = parseSetup(setup)
  } catch (err) {
    result.errors = err instanceof PuzzleSetupError ? err.errors : [String(err)]
    return result
  }

  result.player = summarizeSet(parsed.player, sprites.playerFront ?? sprites.player)
  result.opponent = summarizeSet(parsed.opponent, sprites.opponent)

  if (!Number.isInteger(setup.maxTurns) || setup.maxTurns < 1 || setup.maxTurns > MAX_PUZZLE_TURNS) {
    result.errors.push(`Turn limit has to be between 1 and ${MAX_PUZZLE_TURNS}.`)
    return result
  }
  if (setup.opponentBehavior.mode === 'script' && setup.opponentBehavior.moves.length === 0) {
    result.errors.push('Scripted opponent: list at least one move.')
    return result
  }

  result.firstTurnAi = explainScores(startBattle(parsed, setup.seed), setup.opponentBehavior)

  // ---- 1. every line up to the turn limit ----
  // Each branch copies the battle as it stands instead of replaying it from turn 1.
  const started = Date.now()
  const wins: PlayerChoice[][] = []

  const explore = (battle: Battle, prefix: PlayerChoice[]) => {
    if (battle.ended) {
      if (battle.winner === PLAYER_NAME) wins.push(prefix)
      return
    }
    if (prefix.length >= setup.maxTurns) return // out of turns

    for (const choice of choicesFor(battle, setup)) {
      if (result.battlesRun >= MAX_BATTLES || Date.now() - started > MAX_MILLISECONDS) {
        result.complete = false
        return
      }
      result.battlesRun++
      const next = Battle.fromJSON(JSON.stringify(battle.toJSON()))
      if (playTurn(next, setup, choice, prefix.length + 1)) continue // not allowed
      explore(next, [...prefix, choice])
    }
  }
  explore(startBattle(parsed, setup.seed), [])

  // ---- 2. luck test the winning lines ----
  result.solutions = wins.slice(0, MAX_LINES_LUCK_TESTED).map((choices) => ({
    choices,
    names: describeChoices(choices),
    turns: choices.length,
    ...luckTest(setup, choices),
  }))

  // ---- the line marked as the answer ----
  if (intended.length > 0) {
    const run = runBattle(setup, intended)
    const wins = !run.error && run.view.outcome === 'win'
    result.intended = {
      choices: intended,
      names: describeChoices(intended),
      turns: intended.length,
      ...luckTest(setup, intended),
      wins,
      view: run.view,
    }
    if (run.error) result.errors.push(`Your answer can't be played: ${run.error}`)
    else if (!wins) result.errors.push("Your answer doesn't win this battle with this seed.")
  }

  // ---- warnings ----
  const lineText = (l: CheckedLine) => l.names.map(choiceLabel).join(' → ')

  if (!result.complete) {
    result.warnings.push(`Stopped after ${result.battlesRun} battles, so there may be winning lines that weren't checked. Try a lower turn limit.`)
  }
  if (wins.length === 0) {
    result.warnings.push(`No winning line exists within ${setup.maxTurns} turn${setup.maxTurns === 1 ? '' : 's'}.`)
  }
  if (wins.length > 1) {
    result.warnings.push(`There are ${wins.length} winning lines, so the puzzle has more than one answer.`)
  }
  if (wins.length > MAX_LINES_LUCK_TESTED) {
    result.warnings.push(`Only the first ${MAX_LINES_LUCK_TESTED} winning lines were luck-tested.`)
  }
  const lucky = result.solutions.filter((line) => line.seedWins < line.seedsTried)
  for (const line of lucky.slice(0, 3)) {
    result.warnings.push(`"${lineText(line)}" depends on luck: it wins on ${line.seedWins} of ${line.seedsTried} seeds.`)
  }
  if (lucky.length > 3) result.warnings.push(`${lucky.length - 3} more winning lines also depend on luck.`)
  if (result.intended && result.intended.wins && !wins.some((w) => sameLine(w, intended))) {
    result.warnings.push('Your answer wins, but the search did not reach it (the search stopped early).')
  }

  return result
}