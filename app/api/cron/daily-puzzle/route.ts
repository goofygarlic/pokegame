import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPokemon } from '@/lib/pokeapi'
 
const MAX_DEX_NUMBER = 1025 // update as new generations are added to PokeAPI
 
// need creator_id to satisfy puzzles table's foreign key, use MY admin account.
const ADMIN_USER_ID = '790a1414-ed58-4554-a18b-b9c7c00c2155'
 
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
      const pokemon = await getPokemon(randomDexNumber())
 
      const { data: newPuzzle, error: insertError } = await supabase
        .from('puzzles')
        .insert({
          creator_id: ADMIN_USER_ID,
          type: game.type,
          title: game.title(today),
          description: game.description,
          published: true,
          daily_date: today,
          content: { answer_species: pokemon.name },
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