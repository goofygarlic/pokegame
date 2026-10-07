import type { SupabaseClient } from '@supabase/supabase-js'
import { buildGuessOptions, formLabel, formRulesKey, type GuessOption } from './pokemon-forms'
 
const POKEAPI_ORIGIN = 'https://pokeapi.co'
const POKEAPI_BASE = `${POKEAPI_ORIGIN}/api/v2`
 
export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy'
 
export interface PokemonSummary {
  id: number // PokeAPI id: the Dex number for default forms, 10001+ for alternate forms
  name: string // the Pokémon/form name, e.g. "mimikyu-disguised" or "darmanitan-galar-standard"
  speciesName: string // the species name, e.g. "mimikyu"
  isDefault: boolean // false for alternate forms (Galarian, Mega, Zen Mode, ...)
  formUrl: string | null // PokeAPI pokemon-form resource, used to find the form's debut generation
  baseExperience: number
  height: number // decimetres
  weight: number // hectograms
  types: PokemonType[]
  spriteUrl: string | null
}
 
export interface PokemonSpeciesSummary {
  id: number // National Dex number
  generation: string // e.g. "generation-i"
  color: string       // e.g. "yellow"
  isLegendary: boolean
  isMythical: boolean
}
 
export interface TypeMatchups {
  doubleDamageFrom: PokemonType[]
  halfDamageFrom: PokemonType[]
  noDamageFrom: PokemonType[]
}
 
export interface HintData {
  id: number // PokeAPI id (10001+ for alternate forms)
  dexNumber: number // National Dex number of the species
  name: string // form name, e.g. "darmanitan-galar-standard"
  speciesName: string // e.g. "darmanitan"
  label: string // what players see, e.g. "darmanitan (galarian standard)"
  isDefaultForm: boolean
  baseExperience: number
  height: number
  weight: number
  types: PokemonType[]
  spriteUrl: string | null
  generation: string // the generation this form debuted in
  color: string
  isLegendary: boolean
  isMythical: boolean
  typeMatchups: TypeMatchups[]
}
 
async function pokeApiFetch<T>(pathOrUrl: string): Promise<T> {
  // Accepts "/pokemon/25", a full URL, or the "/api/v2/..." URLs PokeAPI puts in its responses.
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : pathOrUrl.startsWith('/api/')
      ? `${POKEAPI_ORIGIN}${pathOrUrl}`
      : `${POKEAPI_BASE}${pathOrUrl}`
  const res = await fetch(url)
 
  if (!res.ok) {
    throw new Error(`PokeAPI request failed (${res.status}): ${pathOrUrl}`)
  }
 
  return res.json()
}

export interface RawSprites {
  front_default?: string | null
  other?: {
    home?: { front_default?: string | null }
    'official-artwork'?: { front_default?: string | null }
  }
}

// Pixel sprite first. A few newer forms don't have one, so fall back to the
// HOME render, then the official artwork.
export function pickSprite(sprites: RawSprites | null | undefined): string | null {
  return (
    sprites?.front_default ??
    sprites?.other?.home?.front_default ??
    sprites?.other?.['official-artwork']?.front_default ??
    null
  )
}
 
/** Raw fetch — no caching. Prefer getHintData() in application code. */
export async function getPokemon(slugOrId: string | number): Promise<PokemonSummary> {
  const data = await pokeApiFetch<any>(`/pokemon/${slugOrId}`)
 
  return {
    id: data.id,
    name: data.name,
    speciesName: data.species.name,
    isDefault: data.is_default,
    formUrl: data.forms?.[0]?.url ?? null,
    baseExperience: data.base_experience,
    height: data.height,
    weight: data.weight,
    types: data.types.map((t: any) => t.type.name),
    spriteUrl: pickSprite(data.sprites),
  }
}
 
export async function getPokemonSpecies(
  slugOrId: string | number
): Promise<PokemonSpeciesSummary> {
  const data = await pokeApiFetch<any>(`/pokemon-species/${slugOrId}`)
 
  return {
    id: data.id,
    generation: data.generation.name,
    color: data.color.name,
    isLegendary: data.is_legendary,
    isMythical: data.is_mythical,
  }
}

export interface SpeciesVarieties {
  speciesName: string
  varieties: { name: string; isDefault: boolean }[]
}

// Every Pokémon (form) that belongs to a species. This is how a National Dex number
// is linked to its alternate forms, since the forms have their own 10001+ ids.
export async function getSpeciesVarieties(slugOrId: string | number): Promise<SpeciesVarieties> {
  const data = await pokeApiFetch<{
    name: string
    varieties: { is_default: boolean; pokemon: { name: string } }[]
  }>(`/pokemon-species/${slugOrId}`)

  return {
    speciesName: data.name,
    varieties: data.varieties.map((v) => ({ name: v.pokemon.name, isDefault: v.is_default })),
  }
}
 
export async function getTypeMatchups(type: PokemonType): Promise<TypeMatchups> {
  const data = await pokeApiFetch<any>(`/type/${type}`)
  const relations = data.damage_relations
 
  return {
    doubleDamageFrom: relations.double_damage_from.map((t: any) => t.name),
    halfDamageFrom: relations.half_damage_from.map((t: any) => t.name),
    noDamageFrom: relations.no_damage_from.map((t: any) => t.name),
  }
}

// The generation a form first appeared in (Galarian Darmanitan -> generation-viii),
// via pokemon-form -> version group -> generation. Returns null if PokeAPI doesn't say.
async function getFormGeneration(formUrl: string): Promise<string | null> {
  try {
    const form = await pokeApiFetch<{ version_group: { url: string } }>(formUrl)
    const versionGroup = await pokeApiFetch<{ generation: { name: string } }>(form.version_group.url)
    return versionGroup.generation.name
  } catch {
    return null
  }
}
 
// Guesses can be species names ("mimikyu"), but for some species the default form
// has a longer Pokémon name ("mimikyu-disguised"), so /pokemon/mimikyu doesn't exist.
// Try the name as-is first, then fall back to the species' default form.
async function getPokemonForSlug(slug: string): Promise<PokemonSummary> {
  try {
    return await getPokemon(slug)
  } catch (err) {
    const { varieties } = await getSpeciesVarieties(slug)
    const defaultForm = varieties.find((v) => v.isDefault) ?? varieties[0]
    if (!defaultForm) throw err
    return getPokemon(defaultForm.name)
  }
}

async function fetchHintDataFromPokeApi(slug: string): Promise<HintData> {
  const pokemon = await getPokemonForSlug(slug)

  // Look the species up by its own name, so form names like "deoxys-normal" work too.
  // Alternate forms use the generation they debuted in, not their species' generation.
  const [species, formGeneration, typeMatchups] = await Promise.all([
    getPokemonSpecies(pokemon.speciesName),
    !pokemon.isDefault && pokemon.formUrl ? getFormGeneration(pokemon.formUrl) : Promise.resolve(null),
    Promise.all(pokemon.types.map(getTypeMatchups)),
  ])
 
  return {
    id: pokemon.id,
    dexNumber: species.id,
    name: pokemon.name,
    speciesName: pokemon.speciesName,
    label: formLabel(pokemon.name, pokemon.speciesName, pokemon.isDefault),
    isDefaultForm: pokemon.isDefault,
    baseExperience: pokemon.baseExperience,
    height: pokemon.height,
    weight: pokemon.weight,
    types: pokemon.types,
    spriteUrl: pokemon.spriteUrl,
    generation: formGeneration ?? species.generation,
    color: species.color,
    isLegendary: species.isLegendary,
    isMythical: species.isMythical,
    typeMatchups,
  }
}

export async function getHintData(
  slug: string,
  supabase: SupabaseClient
): Promise<HintData> {
  const { data: cached, error: readError } = await supabase
    .from('pokemon_cache')
    .select('data')
    .eq('species_slug', slug)
    .maybeSingle()
 
  if (readError) {
    console.error('pokemon_cache read failed:', readError.message)
  }
 
  // Rows cached before `label` / `dexNumber` existed are refetched and overwritten,
  // so the cache updates itself without a migration.
  if (cached && typeof cached.data?.label === 'string' && typeof cached.data?.dexNumber === 'number') {
    const data = cached.data as HintData
    return { ...data, label: formLabel(data.name, data.speciesName, data.isDefaultForm) }
  }
 
  const hintData = await fetchHintDataFromPokeApi(slug)
 
  const { error: writeError } = await supabase
    .from('pokemon_cache')
    .upsert({ species_slug: slug, data: hintData })
 
  if (writeError) {
    console.error('pokemon_cache write failed:', writeError.message)
  }
 
  return hintData
}

function idFromUrl(url: string): number {
  return Number(url.match(/(\d+)\/?$/)?.[1] ?? 0)
}

// Everything the guess dropdowns list: every species, plus the alternate forms
// allowed in lib/pokemon-forms.ts. Built from two PokeAPI list calls and cached.
export async function getGuessOptions(supabase: SupabaseClient): Promise<GuessOption[]> {
  const CACHE_KEY = `_guess_options_v1:${formRulesKey()}`
 
  const { data: cached, error: readError } = await supabase
    .from('pokemon_cache')
    .select('data')
    .eq('species_slug', CACHE_KEY)
    .maybeSingle()
 
  if (readError) {
    console.error('guess options cache read failed:', readError.message)
  }
 
  if (cached && Array.isArray(cached.data?.options)) {
    return cached.data.options as GuessOption[]
  }

  type NamedList = { results: { name: string; url: string }[] }
  const [pokemonList, speciesList] = await Promise.all([
    pokeApiFetch<NamedList>('/pokemon?limit=2000'),
    pokeApiFetch<NamedList>('/pokemon-species?limit=2000'),
  ])

  const options = buildGuessOptions(
    pokemonList.results.map((r) => ({ name: r.name, id: idFromUrl(r.url) })),
    speciesList.results.map((r) => r.name)
  )
 
  const { error: writeError } = await supabase
    .from('pokemon_cache')
    .upsert({ species_slug: CACHE_KEY, data: { options } })
 
  if (writeError) {
    console.error('guess options cache write failed:', writeError.message)
  }
 
  return options
}