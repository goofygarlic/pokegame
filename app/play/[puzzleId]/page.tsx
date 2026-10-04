import { createClient } from '@/lib/supabase/server'
import { getAllPokemonNames } from '@/lib/pokeapi'
import AutoSignIn from '@/components/auto-sign-in'
import PlayPokedle from '@/components/play-pokedle'
import PlayGuessTheMon from '@/components/play-guess-the-mon'

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
    .select('id, title, description, type, daily_date')
    .eq('id', puzzleId)
    .single()

  if (puzzleError || !puzzle) {
    return <p>Puzzle not found.</p>
  }

  if (puzzle.type === 'guess-the-mon') {
    return (
      <main style={{ padding: '2rem' }}>
        <PlayGuessTheMon />
      </main>
    )
  }

  if (puzzle.type !== 'pokedle') {
    return <p>This puzzle type isn&apos;t supported yet.</p>
  }

  const [{ data: existingAttempt }, pokemonNames] = await Promise.all([
    supabase
      .from('attempts')
      .select('guesses, completed, succeeded')
      .eq('puzzle_id', puzzleId)
      .eq('user_id', user.id)
      .maybeSingle(),
    getAllPokemonNames(supabase),
  ])

  return (
    <main style={{ padding: '2rem' }}>
      <PlayPokedle
        puzzleId={puzzle.id}
        dailyDate={puzzle.daily_date}
        description={puzzle.description}
        pokemonNames={pokemonNames}
        initialGuesses={existingAttempt?.guesses ?? []}
        initialCompleted={existingAttempt?.completed ?? false}
        initialSucceeded={existingAttempt?.succeeded ?? null}
      />
    </main>
  )
}