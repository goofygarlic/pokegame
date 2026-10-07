import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpeciesVarieties } from '@/lib/pokeapi'
import { isAllowedForm } from '@/lib/pokemon-forms'
import { ADMIN_USER_ID } from '@/lib/admin'
 
const MAX_DEX_NUMBER = 1025 // update as new generations are added to PokeAPI
  
// One entry per daily game. Each game gets its own puzzle row every day.
const DAILY_GAMES = [
  {
    type: 'pokedle',
    title: (date: string) => `Pokedle: (${date})`,
    description: "Guess today's Pokemon!",
  },
  {
    type: 'guess_the_mon',
    title: (date: string) => `Guess the Pokemon: (${date})`,
    description: "Name today's Pokemon from its hints!",
  },
]
 
type GameResult =
  | { type: string; status: 'created' | 'already exists'; puzzleId: string }
  | { type: string; status: 'error'; error: string }
 
function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
 
function randomDexNumber(): number {
  return Math.floor(Math.random() * MAX_DEX_NUMBER) + 1 // literally random pokemon
}

// Dex numbers only cover species, and alternate forms have unrelated ids (10001+).
// So: pick a random species, list all of its forms (PokeAPI calls them "varieties"),
// keep the ones FORM_RULES in lib/pokemon-forms.ts allows, then pick one at random.
// Every allowed form of that species has the same chance, e.g. Darmanitan is
// 1/4 each: Standard, Zen, Galarian Standard, Galarian Zen.
async function pickRandomAnswer(): Promise<string> {
  const { speciesName, varieties } = await getSpeciesVarieties(randomDexNumber())
  const allowed = varieties.filter((v) => isAllowedForm(v.name, speciesName, v.isDefault))
  const pool = allowed.length > 0 ? allowed : varieties
  return pool[Math.floor(Math.random() * pool.length)].name
}
 
export async function GET(request: Request) {
  // verify request came from Vercel Cron, not public caller.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
 
  const supabase = createAdminClient()
  const today = todayDateString()
  const results: GameResult[] = []
 
  for (const game of DAILY_GAMES) {
    // if today's puzzle for this game already exists (e.g. cron fired twice, or this was triggered manually to test), don't duplicate it.
    const { data: existing } = await supabase
      .from('puzzles')
      .select('id')
      .eq('daily_date', today)
      .eq('type', game.type)
      .maybeSingle()
 
    if (existing) {
      results.push({ type: game.type, status: 'already exists', puzzleId: existing.id })
      continue
    }
 
    try {
      // each game rolls its own random number, so the two answers are independent (usually different Pokemon, occasionally the same one by chance).
      const answer = await pickRandomAnswer()
 
      const { data: newPuzzle, error: insertError } = await supabase
        .from('puzzles')
        .insert({
          creator_id: ADMIN_USER_ID,
          type: game.type,
          title: game.title(today),
          description: game.description,
          published: true,
          daily_date: today,
          content: { answer_species: answer }, // a Pokémon/form name, e.g. "darmanitan-galar-standard"
        })
        .select('id')
        .single()
 
      if (insertError) throw new Error(insertError.message)
 
      results.push({ type: game.type, status: 'created', puzzleId: newPuzzle.id })
    } catch (err) {
      // one game failing shouldn't stop the other from being created
      results.push({ type: game.type, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }
 
  const failed = results.some((r) => r.status === 'error')
 
  return NextResponse.json({ date: today, results }, { status: failed ? 500 : 200 })
}