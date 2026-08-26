import type { SupabaseClient } from '@supabase/supabase-js'
 
const POKEAPI_BASE = 'https://pokeapi.co/api/v2'
 
export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy'
 
export interface PokemonSummary {
  id: number
  name: string
  baseExperience: number
  height: number // decimetres
  weight: number // hectograms
  types: PokemonType[]
  spriteUrl: string | null
}
 
export interface PokemonSpeciesSummary {
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
  name: string
  baseExperience: number
  height: number
  weight: number
  types: PokemonType[]
  spriteUrl: string | null
  generation: string
  color: string
  isLegendary: boolean
  isMythical: boolean
  typeMatchups: TypeMatchups[]
}
 
async function pokeApiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${POKEAPI_BASE}${path}`)
 
  if (!res.ok) {
    throw new Error(`PokeAPI request failed (${res.status}): ${path}`)
  }
 
  return res.json()
}
 
/** Raw fetch — no caching. Prefer getHintData() in application code. */
export async function getPokemon(slugOrId: string | number): Promise<PokemonSummary> {
  const data = await pokeApiFetch<any>(`/pokemon/${slugOrId}`)
 
  return {
    id: data.id,
    name: data.name,
    baseExperience: data.base_experience,
    height: data.height,
    weight: data.weight,
    types: data.types.map((t: any) => t.type.name),
    spriteUrl: data.sprites?.front_default ?? null,
  }
}
 
export async function getPokemonSpecies(
  slugOrId: string | number
): Promise<PokemonSpeciesSummary> {
  const data = await pokeApiFetch<any>(`/pokemon-species/${slugOrId}`)
 
  return {
    generation: data.generation.name,
    color: data.color.name,
    isLegendary: data.is_legendary,
    isMythical: data.is_mythical,
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
 
async function fetchHintDataFromPokeApi(slug: string): Promise<HintData> {
  const [pokemon, species] = await Promise.all([
    getPokemon(slug),
    getPokemonSpecies(slug),
  ])
 
  const typeMatchups = await Promise.all(pokemon.types.map(getTypeMatchups))
 
  return {
    name: pokemon.name,
    baseExperience: pokemon.baseExperience,
    height: pokemon.height,
    weight: pokemon.weight,
    types: pokemon.types,
    spriteUrl: pokemon.spriteUrl,
    generation: species.generation,
    color: species.color,
    isLegendary: species.isLegendary,
    isMythical: species.isMythical,
    typeMatchups,
  }
}
 
/**
 * Returns everything needed to render hints for a 'guess_the_mon'
 * puzzle for the given species slug (e.g. "pikachu").
 *
 * Checks the pokemon_cache table first. On cache miss, fetches from
 * PokeAPI, stores the result, and returns it — so every species is
 * only ever fetched from PokeAPI once across your whole app's
 * lifetime.
 *
 * Pass any Supabase client (browser or server) that has an active
 * session — anonymous sessions are fine, per the pokemon_cache RLS
 * policies.
 */
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
 
  if (cached) {
    return cached.data as HintData
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