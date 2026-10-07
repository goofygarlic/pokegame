// Reads Pokémon written in Showdown's export format (the text the Showdown teambuilder gives you), checks it, and fills in sensible defaults.

import { Dex, Teams } from '@pkmn/sim'
import type { MoveInfo, SetSummary, TransformSummary } from './types'

// Same shape as the simulator's PokemonSet. Declared here so callers don't need its types.
export interface ParsedSet {
  name: string
  species: string
  item: string
  ability: string
  moves: string[]
  nature: string
  gender: string
  evs: Record<StatId, number>
  ivs: Record<StatId, number>
  level: number
  teraType?: string
  shiny?: boolean
  happiness?: number
}

type StatId = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
const STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

export interface ParseResult {
  set: ParsedSet | null
  errors: string[]
}

// `who` is used in error messages, e.g. "Your Pokémon" or "Opponent".
export function parseSet(text: string, who: string): ParseResult {
  const errors: string[] = []
  const trimmed = text.trim()
  if (!trimmed) return { set: null, errors: [`${who}: paste a Pokémon in Showdown format.`] }

  const imported = Teams.import(trimmed) as unknown as ParsedSet[] | null
  if (!imported || imported.length === 0) {
    return { set: null, errors: [`${who}: couldn't read that. Check it matches Showdown's export format.`] }
  }
  // 1v1 for now; extra Pokémon are ignored with a warning-style error so nothing is silently dropped.
  if (imported.length > 1) errors.push(`${who}: only one Pokémon is supported for now (found ${imported.length}).`)

  const set = imported[0]
  const species = Dex.species.get(set.species)
  if (!species.exists) errors.push(`${who}: "${set.species}" isn't a Pokémon Showdown recognises.`)

  if (set.item && !Dex.items.get(set.item).exists) errors.push(`${who}: unknown item "${set.item}".`)

  // A Mega Stone for a different Pokémon would just do nothing, which is almost certainly a typo.
  const item = Dex.items.get(set.item)
  if (species.exists && item.exists && item.megaStone && !itemTransformation(set)) {
    errors.push(`${who}: ${item.name} doesn't let ${species.name} Mega Evolve.`)
  }

  if (set.ability && !Dex.abilities.get(set.ability).exists) {
    errors.push(`${who}: unknown ability "${set.ability}".`)
  }
  // Without an ability line the simulator gives the Pokémon no ability at all, so use the species' first ability, like the teambuilder does.
  if (!set.ability && species.exists) set.ability = species.abilities['0']

  if (set.nature && !Dex.natures.get(set.nature).exists) errors.push(`${who}: unknown nature "${set.nature}".`)
  if (set.teraType && !Dex.types.get(set.teraType).exists && set.teraType !== 'Stellar') {
    errors.push(`${who}: unknown Tera Type "${set.teraType}".`)
  }

  if (!set.moves || set.moves.length === 0) errors.push(`${who}: needs at least one move.`)
  if (set.moves.length > 4) errors.push(`${who}: has more than four moves.`)
  for (const move of set.moves) {
    if (!Dex.moves.get(move).exists) errors.push(`${who}: unknown move "${move}".`)
  }

  set.level = set.level || 100
  if (set.level < 1 || set.level > 100) errors.push(`${who}: level has to be between 1 and 100.`)

  return { set, errors }
}

export function packSet(set: ParsedSet): string {
  return Teams.pack([set] as never)
}

export function moveInfo(name: string, pp?: number, maxpp?: number, disabled = false): MoveInfo {
  const move = Dex.moves.get(name)
  const fullPp = move.noPPBoosts ? move.pp : Math.floor((move.pp * 8) / 5)
  return {
    id: move.id,
    name: move.name,
    type: move.type,
    category: move.category,
    basePower: move.basePower,
    accuracy: move.accuracy,
    priority: move.priority,
    pp: pp ?? fullPp,
    maxpp: maxpp ?? fullPp,
    disabled,
    description: move.shortDesc || move.desc || '',
  }
}

// The form a held Mega Stone or Primal orb turns this Pokémon into, if any. (Mega Rayquaza needs Dragon Ascent instead of a stone, so it isn't supported.)
export function itemTransformation(set: ParsedSet): { kind: 'mega' | 'primal'; species: string } | null {
  const species = Dex.species.get(set.species)
  const item = Dex.items.get(set.item)
  if (!species.exists || !item.exists) return null

  const stone = item.megaStone as unknown as string | Record<string, string> | undefined
  if (stone) {
    const target =
      typeof stone === 'string'
        ? (item as unknown as { megaEvolves?: string }).megaEvolves === species.name
          ? stone
          : null
        : (stone[species.name] ?? null)
    return target ? { kind: 'mega', species: Dex.species.get(target).name } : null
  }

  if (item.isPrimalOrb) {
    const primal = (species.otherFormes ?? []).map((f) => Dex.species.get(f)).find((f) => f.requiredItem === item.name)
    return primal ? { kind: 'primal', species: primal.name } : null
  }
  return null
}

// Every form this Pokémon could appear in during a battle: its own, its Mega or Primal form if it holds the item, and ability or move-based forms like Zen Mode or Blade Forme.
export function battleFormes(set: ParsedSet): string[] {
  const species = Dex.species.get(set.species)
  if (!species.exists) return []
  const formes = new Set([species.name])

  const transform = itemTransformation(set)
  if (transform) formes.add(transform.species)

  for (const name of species.otherFormes ?? []) {
    const forme = Dex.species.get(name)
    const from = ([] as string[]).concat(forme.battleOnly ?? [])
    if (!from.includes(species.name)) continue
    if (forme.requiredItem || forme.requiredItems || forme.requiredMove) continue // item and Dragon Ascent forms are handled above
    if (forme.isNonstandard === 'Gigantamax' || forme.name.includes('Totem')) continue
    formes.add(forme.name)
  }
  return [...formes]
}

// Stats at the set's level, using the same formula as the games. Pass `speciesName` to work out the stats of another form (a Mega Evolution) with the same EVs and nature.
function calcStats(set: ParsedSet, speciesName = set.species): Record<StatId, number> {
  const species = Dex.species.get(speciesName)
  const nature = Dex.natures.get(set.nature || 'Serious')
  const stats = {} as Record<StatId, number>

  for (const stat of STATS) {
    const base = species.baseStats[stat]
    const iv = set.ivs?.[stat] ?? 31
    const ev = set.evs?.[stat] ?? 0
    const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * set.level) / 100)
    if (stat === 'hp') {
      stats.hp = species.id === 'shedinja' ? 1 : core + set.level + 10
    } else {
      const mod = nature.plus === stat ? 1.1 : nature.minus === stat ? 0.9 : 1
      stats[stat] = Math.floor((core + 5) * mod)
    }
  }
  return stats
}

function transformSummary(set: ParsedSet): TransformSummary | null {
  const transform = itemTransformation(set)
  if (!transform) return null
  const forme = Dex.species.get(transform.species)
  return {
    kind: transform.kind,
    species: forme.name,
    types: [...forme.types],
    ability: forme.abilities['0'],
    stats: calcStats(set, forme.name),
  }
}

export function summarizeSet(set: ParsedSet, spriteUrl: string | null): SetSummary {
  const species = Dex.species.get(set.species)
  return {
    species: species.name,
    level: set.level,
    item: set.item ? Dex.items.get(set.item).name : null,
    ability: set.ability ? Dex.abilities.get(set.ability).name : null,
    nature: set.nature ? Dex.natures.get(set.nature).name : 'Serious',
    teraType: set.teraType || species.types[0] || null, // the simulator's default is the first type
    types: [...species.types],
    stats: calcStats(set),
    moves: set.moves.map((m) => moveInfo(m)),
    spriteUrl,
    transform: transformSummary(set),
  }
}