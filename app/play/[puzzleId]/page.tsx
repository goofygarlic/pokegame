import { createClient } from '@/lib/supabase/server'
import AutoSignIn from '@/components/auto-sign-in'
import PlayWordle from '@/components/play-pokedle'

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
    .select('id, title, description, type, content')
    .eq('id', puzzleId)
    .single()

  if (puzzleError || !puzzle) {
    return <p>Puzzle not found.</p>
  }

  if (puzzle.type !== 'pokedle') {
    // guess_the_mon rendering added separately
    return <p>This puzzle type isn't supported yet.</p>
  }

  const { data: existingAttempt } = await supabase
    .from('attempts')
    .select('guesses, completed, succeeded')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', user.id)
    .maybeSingle()

  // IMPORTANT: only pokemonLength derived from answer and sent to client — answer_species string itself never leaves here.
  const pokemonLength: number = puzzle.content.answer_species.length
  const maxGuesses: number = puzzle.content.max_guesses ?? 6

  return (
    <main style={{ padding: '2rem' }}>
      <h1>{puzzle.title}</h1>
      {puzzle.description && <p>{puzzle.description}</p>}

      <PlayWordle
        puzzleId={puzzle.id}
        pokemonLength={pokemonLength}
        maxGuesses={maxGuesses}
        initialGuesses={existingAttempt?.guesses ?? []}
        initialCompleted={existingAttempt?.completed ?? false}
        initialSucceeded={existingAttempt?.succeeded ?? null}
      />
    </main>
  )
}