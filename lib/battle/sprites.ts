// Finds PokeAPI sprites for a Showdown species name.
// Runs when you check or save a puzzle, and the URLs are stored with the puzzle, so playing a puzzle never calls PokeAPI.

import { Dex } from '@pkmn/sim'
import { pickSprite, type RawSprites } from '@/lib/pokeapi'
import { battleFormes, type ParsedSet } from './sets'
import type { BattleSprites } from './types'

const POKEAPI_BASE = 'https://pokeapi.co/api/v2'

interface RawPokemon {
  name: string
  sprites: RawSprites & { back_default?: string | null }
}

async function fetchPokemon(name: string): Promise<RawPokemon | null> {
  const res = await fetch(`${POKEAPI_BASE}/pokemon/${name}`)
  return res.ok ? res.json() : null
}

// Showdown and PokeAPI name some forms differently ("Darmanitan-Galar" vs "darmanitan-galar-standard"), so try the exact name, then the closest variety.
async function findPokemon(speciesName: string): Promise<RawPokemon | null> {
  const species = Dex.species.get(speciesName)
  if (!species.exists) return null
  const slug = species.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const exact = await fetchPokemon(slug)
  if (exact) return exact

  // Showdown writes gender forms as "-F" / "-M" ("Indeedee-F"); PokeAPI spells them out.
  const gendered = slug.replace(/-f$/, '-female').replace(/-m$/, '-male')
  if (gendered !== slug) {
    const match = await fetchPokemon(gendered)
    if (match) return match
  }

  const res = await fetch(`${POKEAPI_BASE}/pokemon-species/${species.num}`)
  if (!res.ok) return null
  const data: { varieties: { is_default: boolean; pokemon: { name: string } }[] } = await res.json()
  const names = data.varieties.map((v) => v.pokemon.name)
  const match =
    names.find((n) => n.startsWith(`${slug}-`)) ??
    names.find((n) => slug.startsWith(`${n}-`) && n !== names[0]) ??
    data.varieties.find((v) => v.is_default)?.pokemon.name
  return match ? fetchPokemon(match) : null
}

function backSprite(p: RawPokemon): string | null {
  return p.sprites.back_default ?? pickSprite(p.sprites)
}

// Sprites for every form a Pokémon can take mid-battle, keyed by Showdown species name.
async function formSprites(set: ParsedSet | null, back: boolean): Promise<Record<string, string | null>> {
  if (!set) return {}
  const formes = battleFormes(set)
  const found = await Promise.all(formes.map((f) => findPokemon(f).catch(() => null)))
  return Object.fromEntries(formes.map((f, i) => [f, found[i] ? (back ? backSprite(found[i]) : pickSprite(found[i].sprites)) : null]))
}

// Your Pokémon is drawn from behind on the battlefield, like in the games; the opponent from the front.
export async function resolveSprites(playerSet: ParsedSet | null, opponentSet: ParsedSet | null): Promise<BattleSprites> {
  const [player, opponent, playerForms, opponentForms] = await Promise.all([
    playerSet ? findPokemon(playerSet.species).catch(() => null) : null,
    opponentSet ? findPokemon(opponentSet.species).catch(() => null) : null,
    formSprites(playerSet, true),
    formSprites(opponentSet, false),
  ])
  return {
    player: player ? backSprite(player) : null,
    playerFront: player ? pickSprite(player.sprites) : null,
    opponent: opponent ? pickSprite(opponent.sprites) : null,
    forms: { player: playerForms, opponent: opponentForms },
  }
}