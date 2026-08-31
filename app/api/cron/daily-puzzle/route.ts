import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPokemon } from '@/lib/pokeapi'
 
const MAX_DEX_NUMBER = 1025 // update as new generations are added to PokeAPI
 
function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
 
export async function GET(request: Request) {
  // verify request came from Vercel Cron, not public caller.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
 
  const supabase = createAdminClient()
  const today = todayDateString()
 
  // if today's puzzle already exists (e.g. cron fired twice, or this was triggered manually to test), don't duplicate it.
  const { data: existing } = await supabase
    .from('puzzles')
    .select('id')
    .eq('daily_date', today)
    .maybeSingle()
 
  if (existing) {
    return NextResponse.json({
      message: 'Daily puzzle already exists for today',
      puzzleId: existing.id,
    })
  }
 
  // need creator_id to satisfy puzzles table's foreign key, use MY admin account.
  const ADMIN_USER_ID = '790a1414-ed58-4554-a18b-b9c7c00c2155'
  const randomDexNumber = Math.floor(Math.random() * MAX_DEX_NUMBER) + 1 // literally random pokemon
  const pokemon = await getPokemon(randomDexNumber)
 
  const { data: newPuzzle, error: insertError } = await supabase
    .from('puzzles')
    .insert({
      creator_id: ADMIN_USER_ID,
      type: 'pokedle',
      title: `Pokedle: (${today})`,
      description: "Guess today's Pokemon!",
      published: true,
      daily_date: today,
      content: { answer_species: pokemon.name },
    })
    .select()
    .single()
 
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }
 
  return NextResponse.json({
    message: 'Daily puzzle created',
    puzzle: newPuzzle,
  })
}