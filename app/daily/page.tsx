import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function DailyPuzzle() {
  const supabase = await createClient()

  const { data: puzzle } = await supabase
    .from('puzzles')
    .select('id')
    .eq('daily_date', todayDateString())
    .eq('published', true)
    .maybeSingle()

  if (!puzzle) {
    return (
      <main style={{ padding: '2rem' }}>
        <p>No daily puzzle yet, check back soon!</p>
      </main>
    )
  }

  redirect(`/play/${puzzle.id}`)
}