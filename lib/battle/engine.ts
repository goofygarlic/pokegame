// Runs a battle puzzle in Pokémon Showdown's simulator (via @pkmn/sim) with Gen 9 rules.
// Battles are never kept in memory between requests. Every request replays the battle from the start with the same seed and the player's choices so far, which always gives the same result because the seed fixes every random roll.

import { Battle, Dex, extractChannelMessages, toID } from '@pkmn/sim'
import type { Pokemon } from '@pkmn/sim'
import { chooseOpponentMove } from './ai'
import { formatBattleLog } from './log'
import { itemTransformation, moveInfo, packSet, parseSet, type ParsedSet } from './sets'
import type { BattleSetup, BattleView, ChoiceName, MonState, MoveInfo, PlayerChoice } from './types'

export const BATTLE_FORMAT = 'gen9customgame'
export const PLAYER_NAME = 'You'

export class PuzzleSetupError extends Error {
  constructor(public errors: string[]) {
    super(errors.join(' '))
  }
}

export interface ParsedSetup {
  player: ParsedSet
  opponent: ParsedSet
}

export function parseSetup(setup: BattleSetup): ParsedSetup {
  const player = parseSet(setup.player, 'Your Pokémon')
  const opponent = parseSet(setup.opponent, 'Opponent')
  const errors = [...player.errors, ...opponent.errors]
  if (errors.length > 0 || !player.set || !opponent.set) throw new PuzzleSetupError(errors)
  return { player: player.set, opponent: opponent.set }
}

// A fresh battle at the start of turn 1.
export function startBattle(parsed: ParsedSetup, seed: string): Battle {
  const battle = new Battle({ formatid: BATTLE_FORMAT as never, seed: seed as never })
  battle.setPlayer('p1', { name: PLAYER_NAME, team: packSet(parsed.player) })
  battle.setPlayer('p2', { name: 'Opponent', team: packSet(parsed.opponent) })
  battle.choose('p1', 'team 1')
  battle.choose('p2', 'team 1')
  return battle
}

interface RequestMove {
  move: string
  id: string
  pp?: number
  maxpp?: number
  disabled?: boolean | string
}

interface MoveRequest {
    active?: { moves: RequestMove[]; canTerastallize?: string; canMegaEvo?: boolean }[]
}

function playerRequest(battle: Battle): MoveRequest | null {
    return (battle.p1.activeRequest as MoveRequest | null) ?? null
}

// The form the active Pokémon would Mega Evolve into, e.g. "Charizard-Mega-X".
function megaForme(p: Pokemon | undefined): string | null {
    if (!p) return null
    return itemTransformation(p.set as unknown as ParsedSet)?.species ?? null
}

// Plays one turn. Returns an error message if the player's choice isn't allowed.
export function playTurn(battle: Battle, setup: BattleSetup, choice: PlayerChoice, turn: number): string | null {
  const request = playerRequest(battle)?.active?.[0]
  if (!request) return 'The battle is already over.'

  const index = request.moves.findIndex((m) => m.id === toID(choice.move))
  if (index === -1) return `${choice.move} isn't one of your moves this turn.`
  if (request.moves[index].disabled) return `${request.moves[index].move} can't be used right now.`

  if (choice.tera && choice.mega) return "You can't Mega Evolve and terastallize at the same time."
  if (choice.tera && (!setup.allowTera || !request.canTerastallize)) return "You can't terastallize right now."
  // Mega Evolution only needs the right Mega Stone; there's no per-puzzle switch for it.
  if (choice.mega && !request.canMegaEvo) return "You can't Mega Evolve right now."

  const ok = battle.choose('p1', `move ${index + 1}${choice.tera ? ' terastallize' : ''}${choice.mega ? ' mega' : ''}`)
  if (!ok) return battle.p1.choice.error || 'That move is not allowed right now.'

  let opponentChoice = chooseOpponentMove(battle, setup.opponentBehavior, setup.seed, turn)
  // Trainers in the games Mega Evolve the first chance they get, so the opponent always does.
  const opponentRequest = (battle.p2.activeRequest as MoveRequest | null)?.active?.[0]
  if (opponentRequest?.canMegaEvo && opponentChoice.startsWith('move ')) opponentChoice += ' mega'
  if (!battle.choose('p2', opponentChoice)) battle.choose('p2', 'default')
  return null
}

function monState(p: Pokemon): MonState {
  const boosts = Object.fromEntries(Object.entries(p.boosts).filter(([, v]) => v !== 0))
  return {
    species: p.species.name,
    level: p.level,
    hp: p.hp,
    maxhp: p.maxhp,
    status: p.status || null,
    types: p.getTypes(),
    teraType: p.terastallized || null,
    item: p.item ? Dex.items.get(p.item).name : null,
    boosts,
  }
}

export function battleView(battle: Battle, setup: BattleSetup, turnsPlayed: number): BattleView {
  const lines = extractChannelMessages(battle.log.join('\n'), [-1])[-1] ?? []
  const events = formatBattleLog(lines)

  let outcome: BattleView['outcome'] = 'ongoing'
  let lossReason: string | null = null

  if (battle.ended) {
    outcome = battle.winner === PLAYER_NAME ? 'win' : 'loss'
    if (outcome === 'loss') lossReason = battle.p1.active[0]?.fainted || battle.p1.active[0]?.hp === 0 ? 'Your Pokémon fainted.' : 'You lost the battle.'
  } else if (turnsPlayed >= setup.maxTurns) {
    outcome = 'loss'
    lossReason = `You didn't win within ${setup.maxTurns} turn${setup.maxTurns === 1 ? '' : 's'}.`
    events.push({ turn: turnsPlayed, kind: 'result', text: `Out of turns! ${lossReason}` })
  }

  let moves: MoveInfo[] = []
  let canTera: string | null = null
  let canMega: string | null = null
  if (outcome === 'ongoing') {
    const request = playerRequest(battle)?.active?.[0]
    moves = (request?.moves ?? []).map((m) => moveInfo(m.id, m.pp, m.maxpp, !!m.disabled))
    if (setup.allowTera && request?.canTerastallize) canTera = request.canTerastallize
    if (request?.canMegaEvo) canMega = megaForme(battle.p1.active[0])
  }

  return {
    events,
    player: monState(battle.p1.active[0] ?? battle.p1.pokemon[0]),
    opponent: monState(battle.p2.active[0] ?? battle.p2.pokemon[0]),
    turnsPlayed,
    maxTurns: setup.maxTurns,
    outcome,
    lossReason,
    moves,
    canTera,
    canMega,
  }
}

export interface RunResult {
  view: BattleView
  error: string | null // set if one of the choices wasn't allowed; the view stops before it
}

// Replays the battle from the start with these choices.
export function runBattle(setup: BattleSetup, choices: PlayerChoice[], seed = setup.seed): RunResult {
  const parsed = parseSetup(setup)
  const battle = startBattle(parsed, seed)
  const seededSetup = { ...setup, seed }
  let turnsPlayed = 0

  for (const choice of choices) {
    if (battle.ended || turnsPlayed >= setup.maxTurns) {
      return { view: battleView(battle, seededSetup, turnsPlayed), error: 'The battle is already over.' }
    }
    const error = playTurn(battle, seededSetup, choice, turnsPlayed + 1)
    if (error) return { view: battleView(battle, seededSetup, turnsPlayed), error }
    turnsPlayed++
  }

  return { view: battleView(battle, seededSetup, turnsPlayed), error: null }
}

// "Endeavor → Tera Quick Attack" style names for a line of choices.
// Move names for a line of choices, plus whether each one used Tera or Mega Evolution.
export function describeChoices(choices: PlayerChoice[]): ChoiceName[] {
  return choices.map((c) => ({ name: Dex.moves.get(c.move).name || c.move, tera: !!c.tera, mega: !!c.mega }))
}