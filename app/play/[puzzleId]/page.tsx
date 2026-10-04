import { createClient } from '@/lib/supabase/server'
import { getAllPokemonNames } from '@/lib/pokeapi'
import AutoSignIn from '@/components/auto-sign-in'
import PlayPokedle from '@/components/play-pokedle'
import PlayGuessTheMon from '@/components/play-guess-the-mon'
import {
  buildAllHintValues,
  buildHintValues,
  getGuessTheMonData,
  loadGuessTheMon,
  toAnswerReveal,
} from '@/lib/guess-the-mon'

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

  // Each game type has its own component; this page picks the right one.
  if (puzzle.type === 'guess_the_mon') {
    const loaded = await loadGuessTheMon(supabase, puzzleId, user.id)
    if (!loaded) {
      return <p>Puzzle not found.</p>
    }

    const { attempt } = loaded
    const solved = attempt.completed && attempt.succeeded === true
    const needsData = solved || attempt.revealedHints.length > 0

    const [pokemonNames, data] = await Promise.all([
      getAllPokemonNames(supabase),
      // Only look up the answer when there's something to show, and never send it unless solved.
      needsData ? getGuessTheMonData(loaded.answerSlug, supabase).catch(() => null) : Promise.resolve(null),
    ])

    if (needsData && !data) {
      return (
        <main style={{ padding: '2rem' }}>
          <p>Couldn&apos;t load today&apos;s puzzle. Please refresh in a moment.</p>
        </main>
      )
    }

    return (
      <main style={{ padding: '2rem' }}>
        <PlayGuessTheMon
          puzzleId={puzzle.id}
          dailyDate={puzzle.daily_date}
          description={puzzle.description}
          pokemonNames={pokemonNames}
          initialRevealedHints={attempt.revealedHints}
          initialHints={data ? (solved ? buildAllHintValues(data) : buildHintValues(attempt.revealedHints, data)) : {}}
          initialWrongGuesses={attempt.guesses.filter((g) => !g.correct).map((g) => g.guess)}
          initialAnswer={solved && data ? toAnswerReveal(data) : null}
        />
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