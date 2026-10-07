// The opponent's brain
// "ai" mode works like trainer AI in the main games: every move the opponent can use starts at 100 points, each AI flag adds or removes points, and the opponent uses the highest-scoring move. Ties are broken by a coin flip seeded from the puzzle's seed and the turn number, so a puzzle always plays out the same way.
// Damage estimates come from @smogon/calc, the same calculator Smogon uses.
// "script" mode just uses the move listed for that turn.

import { Dex, toID } from '@pkmn/sim'
import type { Battle, Pokemon } from '@pkmn/sim'
import { calculate, Field, Generations, Move as CalcMove, Pokemon as CalcPokemon, Side as CalcSide } from '@smogon/calc'
import type { AiFlag, OpponentBehavior } from './types'

const gen = Generations.get(9)

// =============================================================================
//  TUNABLE: AI SCORING
//  How many points each flag adds or removes. The opponent picks the highest total.
// =============================================================================
const SCORES = {
  badMove: -10, // checkBadMove: the move would fail or do nothing
  guaranteedKo: 4, // tryToFaint: knocks you out even on its lowest damage roll
  possibleKo: 2, // tryToFaint: knocks you out on a high damage roll
  priorityKoWhenSlower: 2, // tryToFaint: extra for a priority KO when you are faster
  superEffective: 1, // checkViability
  resisted: -1, // checkViability
  statusHealthyTarget: 1, // checkViability: status move into a target with no status
  healWhenLow: 2, // checkViability: healing move under half HP
  setupWhenSafe: 1, // checkViability: stat boost on its first turn out
  strongest: 2, // preferStrongest: the move that does the most damage
}
// =============================================================================

interface RequestMove {
  move: string
  id: string
  disabled?: boolean | string
}

interface Option {
  index: number // 1-based slot in the request, used for the choice string
  id: string
}

function usableMoves(side: Battle['p1']): Option[] {
  const request = side.activeRequest as { active?: { moves: RequestMove[] }[] } | null
  const moves = request?.active?.[0]?.moves ?? []
  return moves.flatMap((m, i) => (m.disabled ? [] : [{ index: i + 1, id: m.id }]))
}

// Small deterministic random number generator, seeded from a string.
function seededRandom(key: string): () => number {
  let h = 1779033703 ^ key.length
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let state = h >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toCalcPokemon(p: Pokemon): CalcPokemon {
  const { accuracy: _a, evasion: _e, ...statBoosts } = p.boosts
  void _a
  void _e
  return new CalcPokemon(gen, p.species.name, {
    level: p.level,
    item: p.item ? (Dex.items.get(p.item).name as never) : undefined,
    ability: p.ability ? (Dex.abilities.get(p.ability).name as never) : undefined,
    nature: (p.set.nature || undefined) as never,
    evs: p.set.evs,
    ivs: p.set.ivs,
    boosts: statBoosts,
    status: (p.status || '') as never,
    curHP: p.hp,
    teraType: (p.terastallized || undefined) as never,
  })
}

const WEATHER: Record<string, string> = {
  sunnyday: 'Sun',
  raindance: 'Rain',
  sandstorm: 'Sand',
  snowscape: 'Snow',
  desolateland: 'Harsh Sunshine',
  primordialsea: 'Heavy Rain',
  deltastream: 'Strong Winds',
}

const TERRAIN: Record<string, string> = {
  electricterrain: 'Electric',
  grassyterrain: 'Grassy',
  mistyterrain: 'Misty',
  psychicterrain: 'Psychic',
}

function calcSide(side: Battle['p1']): CalcSide {
  return new CalcSide({
    isReflect: !!side.sideConditions['reflect'],
    isLightScreen: !!side.sideConditions['lightscreen'],
    isAuroraVeil: !!side.sideConditions['auroraveil'],
  })
}

// [min, max] damage a move would do right now, or null if it isn't a damaging move
// (or the calculator can't handle it).
function damageRange(battle: Battle, user: Pokemon, target: Pokemon, moveId: string): [number, number] | null {
  const move = Dex.moves.get(moveId)
  if (move.category === 'Status') return null

  // Moves whose damage depends on HP, which the calculator reports as 0.
  if (move.id === 'endeavor') {
    const d = Math.max(0, target.hp - user.hp)
    return [d, d]
  }
  if (move.id === 'finalgambit') return [user.hp, user.hp]
  if (move.id === 'superfang' || move.id === 'naturesmadness' || move.id === 'ruination') {
    const d = Math.max(1, Math.floor(target.hp / 2))
    return [d, d]
  }
  if (move.id === 'counter' || move.id === 'mirrorcoat' || move.id === 'metalburst') return null

  try {
    const result = calculate(
      gen,
      toCalcPokemon(user),
      toCalcPokemon(target),
      new CalcMove(gen, move.name),
      new Field({
        weather: WEATHER[battle.field.weather] as never,
        terrain: TERRAIN[battle.field.terrain] as never,
        attackerSide: calcSide(user.side),
        defenderSide: calcSide(target.side),
      })
    )
    const [min, max] = result.range()
    return [min, max]
  } catch {
    return null
  }
}

function isBadMove(user: Pokemon, target: Pokemon, moveId: string, damage: [number, number] | null): boolean {
  const move = Dex.moves.get(moveId)
  const targetTypes = target.getTypes()

  if (move.category !== 'Status') {
    if (damage && damage[1] === 0) return true // immune, or no effect
    if (!damage && !Dex.getImmunity(move.type, targetTypes)) return true
  }

  if (move.id === 'endeavor' && user.hp >= target.hp) return true
  if ((move.id === 'fakeout' || move.id === 'firstimpression') && user.activeMoveActions > 0) return true
  if ((move.id === 'sleeptalk' || move.id === 'snore') && user.status !== 'slp') return true
  if ((move.id === 'dreameater' || move.id === 'nightmare') && target.status !== 'slp') return true
  if (move.id === 'substitute' && user.volatiles['substitute']) return true

  if (move.status) {
    if (target.status) return true
    if (!Dex.getImmunity(move.status, targetTypes)) return true
    if (move.ignoreImmunity === false && !Dex.getImmunity(move.type, targetTypes)) return true
  }

  // Self-boosting move when every stat it raises is already maxed out.
  const selfBoosts = move.target === 'self' ? move.boosts : move.self?.boosts
  if (selfBoosts && move.category === 'Status') {
    const stats = Object.keys(selfBoosts) as (keyof typeof user.boosts)[]
    if (stats.length > 0 && stats.every((s) => user.boosts[s] >= 6)) return true
  }

  if (move.heal && user.hp >= user.maxhp) return true
  return false
}

function scoreMoves(battle: Battle, options: Option[], flags: AiFlag[]): number[] {
  const user = battle.p2.active[0]
  const target = battle.p1.active[0]
  const has = (flag: AiFlag) => flags.includes(flag)

  const damages = options.map((o) => damageRange(battle, user, target, o.id))
  const averages = damages.map((d) => (d ? (d[0] + d[1]) / 2 : 0))
  const best = Math.max(0, ...averages)
  const playerFaster = target.getStat('spe') >= user.getStat('spe')

  return options.map((option, i) => {
    const move = Dex.moves.get(option.id)
    const damage = damages[i]
    let score = 100

    if (has('checkBadMove') && isBadMove(user, target, option.id, damage)) score += SCORES.badMove

    if (has('tryToFaint') && damage) {
      if (damage[0] >= target.hp) {
        score += SCORES.guaranteedKo
        if (move.priority > 0 && playerFaster) score += SCORES.priorityKoWhenSlower
      } else if (damage[1] >= target.hp) {
        score += SCORES.possibleKo
      }
    }

    if (has('checkViability')) {
      const types = target.getTypes()
      if (move.category !== 'Status' && Dex.getImmunity(move.type, types)) {
        const effectiveness = Dex.getEffectiveness(move.type, types)
        if (effectiveness > 0) score += SCORES.superEffective
        if (effectiveness < 0) score += SCORES.resisted
      }
      if (move.status && !target.status && Dex.getImmunity(move.status, types)) score += SCORES.statusHealthyTarget
      if (move.heal && user.hp < user.maxhp / 2) score += SCORES.healWhenLow
      const selfBoosts = move.target === 'self' ? move.boosts : null
      if (selfBoosts && user.activeMoveActions === 0) score += SCORES.setupWhenSafe
    }

    if (has('preferStrongest') && best > 0 && averages[i] === best) score += SCORES.strongest

    return score
  })
}

// Returns the opponent's choice for this turn, e.g. "move 2".
export function chooseOpponentMove(battle: Battle, behavior: OpponentBehavior, seed: string, turn: number): string {
  const options = usableMoves(battle.p2)
  if (options.length === 0) return 'default'

  if (behavior.mode === 'script') {
    const scripted = behavior.moves[Math.min(turn - 1, behavior.moves.length - 1)]
    const match = scripted ? options.find((o) => o.id === toID(scripted)) : undefined
    // If the scripted move can't be used this turn (no PP, disabled, ...), use the first move that can.
    return `move ${(match ?? options[0]).index}`
  }

  const scores = scoreMoves(battle, options, behavior.flags)
  const top = Math.max(...scores)
  const tied = options.filter((_, i) => scores[i] === top)
  const random = seededRandom(`${seed}:ai:${turn}`)
  const pick = tied[Math.floor(random() * tied.length)]
  return `move ${pick.index}`
}

// For the builder: what the AI would score each move on the first turn.
export function explainScores(battle: Battle, behavior: OpponentBehavior): { move: string; score: number }[] {
  if (behavior.mode !== 'ai') return []
  const options = usableMoves(battle.p2)
  const scores = scoreMoves(battle, options, behavior.flags)
  return options.map((o, i) => ({ move: Dex.moves.get(o.id).name, score: scores[i] }))
}