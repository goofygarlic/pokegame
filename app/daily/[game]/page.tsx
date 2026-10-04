import PlayGuessTheMon from '@/components/play-guess-the-mon'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

// URL slug -> puzzle type in the database. Add a line here for each new game.
const GAMES: Record<string, string> = {
  pokedle: 'pokedle',
  'guess-the-mon': 'guess_the_mon',
}

function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// Finds today's puzzle for the requested game and sends the player to
// /play/[puzzleId], which renders the right component for that puzzle type.
export default async function DailyGame({
  params,
}: {
  params: Promise<{ game: string }>
}) {
  const { game } = await params
  const type = GAMES[game]

  if (!type) {
    notFound()
  }

  const supabase = await createClient()

  const { data: puzzle } = await supabase
    .from('puzzles')
    .select('id')
    .eq('daily_date', todayDateString())
    .eq('type', type)
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