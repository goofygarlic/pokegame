// Server-side data for Guess the Pokémon. Only import this from server code
// (route handlers and server components) so the answer never reaches the browser.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTypeMatchups, type PokemonType, type TypeMatchups } from './pokeapi'
import { HINTS, isHintKey, type HintKey, type HintValue } from './guess-the-mon-config'

const POKEAPI_ORIGIN = 'https://pokeapi.co'
const POKEAPI_BASE = `${POKEAPI_ORIGIN}/api/v2`

// Bump the version if the GuessTheMonData shape changes, so old cache rows are ignored.
const CACHE_PREFIX = 'gtm-v1:'

const ALL_TYPES: PokemonType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]

export interface GuessTheMonData {
  speciesName: string // what the player has to guess, e.g. "eevee"
  dexNumber: number
  spriteUrl: string | null
  cryUrl: string | null
  heightM: number
  weightKg: number
  eggGroups: string[]
  captureRate: number
  genderRate: number // -1 = genderless, otherwise female chance in eighths
  growthRate: string
  weaknesses: { type: PokemonType; multiplier: number }[]
  evolution: { stage: number; totalStages: number; from: string | null; to: string[] }
}

export interface AnswerReveal {
  name: string
  dexNumber: number
  spriteUrl: string | null
}

// One entry in attempts.guesses for this game.
export interface GuessEntry {
  guess: string
  correct: boolean
  guessed_at: string
}

// ---- Raw PokeAPI shapes (only the fields we read) ---------------------------

interface NamedRef {
  name: string
  url: string
}

interface RawPokemon {
  name: string
  height: number // decimetres
  weight: number // hectograms
  types: { slot: number; type: NamedRef }[]
  sprites?: { front_default?: string | null }
  cries?: { latest?: string | null; legacy?: string | null }
  species: NamedRef
}

interface RawSpecies {
  id: number
  name: string
  capture_rate: number
  gender_rate: number
  egg_groups: NamedRef[]
  growth_rate: NamedRef
  evolution_chain: { url: string } | null
}

interface RawEvolutionDetail {
  trigger?: NamedRef | null
  is_default?: boolean
  min_level?: number | null
  item?: NamedRef | null
  held_item?: NamedRef | null
  known_move?: NamedRef | null
  known_move_type?: NamedRef | null
  location?: NamedRef | null
  min_happiness?: number | null
  min_affection?: number | null
  min_beauty?: number | null
  time_of_day?: string | null
  gender?: number | null
  party_species?: NamedRef | null
  party_type?: NamedRef | null
  trade_species?: NamedRef | null
  needs_overworld_rain?: boolean | null
  turn_upside_down?: boolean | null
  relative_physical_stats?: number | null
}

interface RawChainLink {
  species: NamedRef
  evolution_details: RawEvolutionDetail[]
  evolves_to: RawChainLink[]
}

interface RawEvolutionChain {
  chain: RawChainLink
}

// ---- Display labels ---------------------------------------------------------

const EGG_GROUP_LABELS: Record<string, string> = {
  monster: 'Monster',
  water1: 'Water 1',
  water2: 'Water 2',
  water3: 'Water 3',
  bug: 'Bug',
  flying: 'Flying',
  ground: 'Field',
  fairy: 'Fairy',
  plant: 'Grass',
  humanshape: 'Human-Like',
  mineral: 'Mineral',
  indeterminate: 'Amorphous',
  ditto: 'Ditto',
  dragon: 'Dragon',
  'no-eggs': 'Undiscovered',
}

const GROWTH_RATE_LABELS: Record<string, string> = {
  slow: 'Slow',
  medium: 'Medium Fast',
  fast: 'Fast',
  'medium-slow': 'Medium Slow',
  'slow-then-very-fast': 'Erratic',
  'fast-then-very-slow': 'Fluctuating',
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// "a Metal Coat", "an Ice Stone"
function withArticle(slug: string): string {
  const name = titleCase(slug)
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

// ---- Evolution --------------------------------------------------------------

// PokeAPI can list one detail per game; prefer the one it marks as default,
// otherwise use the newest (last) one.
function pickDetail(details: RawEvolutionDetail[]): RawEvolutionDetail | null {
  if (details.length === 0) return null
  return details.find((d) => d.is_default) ?? details[details.length - 1]
}

// Describes HOW an evolution happens without naming the other Pokémon.
export function formatEvolutionDetail(detail: RawEvolutionDetail | null): string {
  if (!detail) return 'Special condition'
  const trigger = detail.trigger?.name

  if (trigger === 'use-item' && detail.item) {
    return `Use ${withArticle(detail.item.name)}`
  }

  if (trigger === 'trade') {
    let text = 'Trade'
    if (detail.held_item) text += ` while holding ${withArticle(detail.held_item.name)}`
    if (detail.trade_species) text += ' for a specific Pokémon'
    return text
  }

  if (trigger === 'level-up') {
    const base = detail.min_level ? `Level ${detail.min_level}` : 'Level up'
    const conditions: string[] = []

    if (detail.held_item) conditions.push(`while holding ${withArticle(detail.held_item.name)}`)
    if (detail.known_move) conditions.push(`knowing ${titleCase(detail.known_move.name)}`)
    if (detail.known_move_type) conditions.push(`knowing a ${titleCase(detail.known_move_type.name)}-type move`)
    if (detail.min_happiness) conditions.push('with high friendship')
    if (detail.min_affection) conditions.push('with high affection')
    if (detail.min_beauty) conditions.push('with high Beauty')
    if (detail.location) conditions.push('at a special location')
    if (detail.party_species) conditions.push('with a specific Pokémon in the party')
    if (detail.party_type) conditions.push(`with a ${titleCase(detail.party_type.name)}-type Pokémon in the party`)
    if (detail.needs_overworld_rain) conditions.push("while it's raining")
    if (detail.turn_upside_down) conditions.push('with the console held upside down')
    if (detail.relative_physical_stats === 1) conditions.push('with Attack higher than Defense')
    if (detail.relative_physical_stats === -1) conditions.push('with Defense higher than Attack')
    if (detail.relative_physical_stats === 0) conditions.push('with equal Attack and Defense')
    if (detail.time_of_day === 'day') conditions.push('during the day')
    if (detail.time_of_day === 'night') conditions.push('at night')
    if (detail.time_of_day === 'dusk') conditions.push('at dusk')
    if (detail.gender === 1) conditions.push('(female only)')
    if (detail.gender === 2) conditions.push('(male only)')

    return [base, ...conditions].join(' ')
  }

  return 'Special condition'
}

function findPath(node: RawChainLink, speciesName: string): RawChainLink[] | null {
  if (node.species.name === speciesName) return [node]
  for (const child of node.evolves_to) {
    const path = findPath(child, speciesName)
    if (path) return [node, ...path]
  }
  return null
}

function maxDepth(node: RawChainLink): number {
  if (node.evolves_to.length === 0) return 0
  return 1 + Math.max(...node.evolves_to.map(maxDepth))
}

function analyzeEvolution(chain: RawEvolutionChain | null, speciesName: string): GuessTheMonData['evolution'] {
  const path = chain ? findPath(chain.chain, speciesName) : null
  if (!chain || !path) return { stage: 1, totalStages: 1, from: null, to: [] }

  const node = path[path.length - 1]
  return {
    stage: path.length,
    totalStages: maxDepth(chain.chain) + 1,
    from: path.length > 1 ? formatEvolutionDetail(pickDetail(node.evolution_details)) : null,
    to: node.evolves_to.map((child) => formatEvolutionDetail(pickDetail(child.evolution_details))),
  }
}

// ---- Weaknesses -------------------------------------------------------------

function computeWeaknesses(matchups: TypeMatchups[]): GuessTheMonData['weaknesses'] {
  return ALL_TYPES.map((attacking) => {
    const multiplier = matchups.reduce((m, defending) => {
      if (defending.noDamageFrom.includes(attacking)) return 0
      if (defending.doubleDamageFrom.includes(attacking)) return m * 2
      if (defending.halfDamageFrom.includes(attacking)) return m * 0.5
      return m
    }, 1)
    return { type: attacking, multiplier }
  })
    .filter((w) => w.multiplier > 1)
    .sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type))
}

// ---- Building + fetching ----------------------------------------------------

// Pure function (no network), so it can be tested against saved PokeAPI JSON.
export function buildGuessTheMonData(
  pokemon: RawPokemon,
  species: RawSpecies,
  chain: RawEvolutionChain | null,
  matchups: TypeMatchups[]
): GuessTheMonData {
  return {
    speciesName: species.name,
    dexNumber: species.id,
    spriteUrl: pokemon.sprites?.front_default ?? null,
    cryUrl: pokemon.cries?.latest ?? pokemon.cries?.legacy ?? null,
    heightM: pokemon.height / 10,
    weightKg: pokemon.weight / 10,
    eggGroups: species.egg_groups.map((g) => g.name),
    captureRate: species.capture_rate,
    genderRate: species.gender_rate,
    growthRate: species.growth_rate.name,
    weaknesses: computeWeaknesses(matchups),
    evolution: analyzeEvolution(chain, species.name),
  }
}

function absoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${POKEAPI_ORIGIN}${url}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PokeAPI request failed (${res.status}): ${url}`)
  return res.json()
}

async function fetchGuessTheMonData(slug: string): Promise<GuessTheMonData> {
  // Start from /pokemon so form names like "deoxys-normal" work, then follow its species link.
  const pokemon = await fetchJson<RawPokemon>(`${POKEAPI_BASE}/pokemon/${slug}`)
  const species = await fetchJson<RawSpecies>(absoluteUrl(pokemon.species.url))

  const [chain, matchups] = await Promise.all([
    species.evolution_chain
      ? fetchJson<RawEvolutionChain>(absoluteUrl(species.evolution_chain.url))
      : Promise.resolve(null),
    Promise.all(pokemon.types.map((t) => getTypeMatchups(t.type.name as PokemonType))),
  ])

  return buildGuessTheMonData(pokemon, species, chain, matchups)
}

// Same caching approach as getHintData in lib/pokeapi.ts.
export async function getGuessTheMonData(slug: string, supabase: SupabaseClient): Promise<GuessTheMonData> {
  const cacheKey = `${CACHE_PREFIX}${slug}`

  const { data: cached, error: readError } = await supabase
    .from('pokemon_cache')
    .select('data')
    .eq('species_slug', cacheKey)
    .maybeSingle()

  if (readError) {
    console.error('pokemon_cache read failed:', readError.message)
  }

  if (cached) {
    return cached.data as GuessTheMonData
  }

  const data = await fetchGuessTheMonData(slug)

  const { error: writeError } = await supabase.from('pokemon_cache').upsert({ species_slug: cacheKey, data })

  if (writeError) {
    console.error('pokemon_cache write failed:', writeError.message)
  }

  return data
}

// ---- Hint values ------------------------------------------------------------

function lines(...values: string[]): HintValue {
  return { kind: 'lines', lines: values }
}

function catchRateLabel(rate: number): string {
  if (rate <= 10) return 'very hard to catch'
  if (rate <= 50) return 'hard to catch'
  if (rate <= 120) return 'moderate'
  return 'easy to catch'
}

export function buildHintValue(key: HintKey, data: GuessTheMonData): HintValue {
  switch (key) {
    case 'height':
      return lines(`${trimNumber(data.heightM)} m`)

    case 'weight':
      return lines(`${trimNumber(data.weightKg)} kg`)

    case 'egg_groups':
      return lines(...data.eggGroups.map((g) => EGG_GROUP_LABELS[g] ?? titleCase(g)))

    case 'growth_rate':
      return lines(GROWTH_RATE_LABELS[data.growthRate] ?? titleCase(data.growthRate))

    case 'gender_ratio': {
      if (data.genderRate < 0) return lines('Genderless')
      const female = (data.genderRate / 8) * 100
      return lines(`${trimNumber(100 - female)}% male`, `${trimNumber(female)}% female`)
    }

    case 'catch_rate':
      return lines(`${data.captureRate} out of 255`, `(${catchRateLabel(data.captureRate)})`)

    case 'weaknesses':
      if (data.weaknesses.length === 0) return lines('No weaknesses')
      return lines(...data.weaknesses.map((w) => `${titleCase(w.type)} ×${w.multiplier}`))

    case 'evolution': {
      const { stage, totalStages, from, to } = data.evolution
      if (totalStages === 1) return lines('Does not evolve')

      const result = [`Stage ${stage} of ${totalStages}`]
      if (from) result.push(`Evolved from its previous form: ${from}`)
      if (to.length === 1) result.push(`Evolves into its next form: ${to[0]}`)
      if (to.length > 1) {
        result.push(`Evolves into ${to.length} different forms:`)
        result.push(...Array.from(new Set(to)))
      }
      if (to.length === 0) result.push('Fully evolved')
      return lines(...result)
    }

    case 'cry':
      return data.cryUrl ? { kind: 'audio' } : lines('No cry available')
  }
}

export function buildHintValues(keys: readonly HintKey[], data: GuessTheMonData): Partial<Record<HintKey, HintValue>> {
  return Object.fromEntries(keys.map((key) => [key, buildHintValue(key, data)]))
}

export function buildAllHintValues(data: GuessTheMonData): Partial<Record<HintKey, HintValue>> {
  return buildHintValues(
    HINTS.map((h) => h.key),
    data
  )
}

export function toAnswerReveal(data: GuessTheMonData): AnswerReveal {
  return { name: data.speciesName, dexNumber: data.dexNumber, spriteUrl: data.spriteUrl }
}

// ---- Loading and saving a player's attempt ------------------------------------

export interface GuessTheMonAttempt {
  guesses: GuessEntry[]
  revealedHints: HintKey[]
  completed: boolean
  succeeded: boolean | null
}

export interface LoadedGuessTheMon {
  answerSlug: string
  dailyDate: string | null
  description: string | null
  attempt: GuessTheMonAttempt
}

// Returns null if the puzzle doesn't exist or isn't a Guess the Pokémon puzzle.
export async function loadGuessTheMon(
  supabase: SupabaseClient,
  puzzleId: string,
  userId: string
): Promise<LoadedGuessTheMon | null> {
  const { data: puzzle } = await supabase
    .from('puzzles')
    .select('id, type, content, daily_date, description')
    .eq('id', puzzleId)
    .maybeSingle()

  if (!puzzle || puzzle.type !== 'guess_the_mon' || !puzzle.content?.answer_species) return null

  const { data: row, error } = await supabase
    .from('attempts')
    .select('guesses, revealed_hints, completed, succeeded')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', userId)
    .maybeSingle()

  // Fail loudly rather than treating a read error as a fresh, unsolved attempt.
  if (error) throw new Error(`Couldn't load attempt: ${error.message}`)

  const revealed: unknown[] = Array.isArray(row?.revealed_hints) ? row.revealed_hints : []

  return {
    answerSlug: puzzle.content.answer_species,
    dailyDate: puzzle.daily_date,
    description: puzzle.description,
    attempt: {
      guesses: Array.isArray(row?.guesses) ? (row.guesses as GuessEntry[]) : [],
      revealedHints: revealed.filter(isHintKey),
      completed: row?.completed ?? false,
      succeeded: row?.succeeded ?? null,
    },
  }
}

export async function saveGuessTheMonAttempt(
  supabase: SupabaseClient,
  puzzleId: string,
  userId: string,
  attempt: GuessTheMonAttempt
) {
  return supabase.from('attempts').upsert(
    {
      puzzle_id: puzzleId,
      user_id: userId,
      guesses: attempt.guesses,
      revealed_hints: attempt.revealedHints,
      hints_used: attempt.revealedHints.length,
      completed: attempt.completed,
      succeeded: attempt.succeeded,
      completed_at: attempt.completed ? new Date().toISOString() : null,
    },
    { onConflict: 'puzzle_id,user_id' }
  )
}

export function wrongGuessCount(attempt: GuessTheMonAttempt): number {
  return attempt.guesses.filter((g) => !g.correct).length
}