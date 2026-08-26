import { createClient } from '@/lib/supabase/server'
import AutoSignIn from '@/components/auto-sign-in'
import PlayPokedle from '@/components/play-pokedle'

export default async function PlayPuzzle({
  params,
}: {
  params: Promise<{ puzzleId: string }>
}) {
  const { puzzleId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <AutoSignIn />
  }

  const { data: puzzle, error: puzzleError } = await supabase
    .from('puzzles')
    .select('id, title, description, type')
    .eq('id', puzzleId)
    .single()

  if (puzzleError || !puzzle) {
    return <p>Puzzle not found.</p>
  }

  if (puzzle.type !== 'pokedle') {
    // guess_the_mon rendering will be added separately
    return <p>This puzzle type isn't supported yet.</p>
  }

  const { data: existingAttempt } = await supabase
    .from('attempts')
    .select('guesses, completed, succeeded')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <main style={{ padding: '2rem' }}>
      <h1>{puzzle.title}</h1>
      {puzzle.description && <p>{puzzle.description}</p>}

      <PlayPokedle
        puzzleId={puzzle.id}
        initialGuesses={existingAttempt?.guesses ?? []}
        initialCompleted={existingAttempt?.completed ?? false}
        initialSucceeded={existingAttempt?.succeeded ?? null}
      />
    </main>
  )
}