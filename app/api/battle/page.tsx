import Link from 'next/link'
import SiteHeader from '@/components/site-header'
import { createClient } from '@/lib/supabase/server'
import { BATTLE_TYPE, isBattleContent } from '@/lib/battle/puzzles'
import { difficultyLabel } from '@/lib/battle/types'
import styles from './battle.module.css'

interface ListedPuzzle {
  id: string
  number: number
  title: string
  description: string | null
  difficulty: string
  maxTurns: number
  status: 'new' | 'playing' | 'won' | 'lost'
}

const STATUS_LABELS: Record<ListedPuzzle['status'], string> = {
  new: 'New',
  playing: 'In progress',
  won: 'Solved',
  lost: 'Failed',
}

// Every published battle puzzle, newest first. Unlike the daily games these never expire.
export default async function BattlePuzzles() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: rows } = await supabase
    .from('puzzles')
    .select('id, title, description, content')
    .eq('type', BATTLE_TYPE)
    .eq('published', true)

  const puzzles = (rows ?? [])
    .filter((r) => isBattleContent(r.content))
    .sort((a, b) => String(a.content.createdAt).localeCompare(String(b.content.createdAt)))

  // The player's progress on each puzzle (guests without a session just see "New").
  const attempts = new Map<string, { completed: boolean; succeeded: boolean | null }>()
  if (user && puzzles.length > 0) {
    const { data } = await supabase
      .from('attempts')
      .select('puzzle_id, completed, succeeded')
      .eq('user_id', user.id)
      .in(
        'puzzle_id',
        puzzles.map((p) => p.id)
      )
    for (const a of data ?? []) attempts.set(a.puzzle_id, a)
  }

  const listed: ListedPuzzle[] = puzzles
    .map((p, i) => {
      const attempt = attempts.get(p.id)
      const status: ListedPuzzle['status'] = !attempt
        ? 'new'
        : !attempt.completed
          ? 'playing'
          : attempt.succeeded
            ? 'won'
            : 'lost'
      return {
        id: p.id,
        number: i + 1,
        title: p.title,
        description: p.description,
        difficulty: p.content.difficulty,
        maxTurns: p.content.maxTurns,
        status,
      }
    })
    .reverse()

  return (
    <main className={styles.page}>
      <SiteHeader />

      <section className={styles.intro}>
        <h1 className={styles.title}>Battle puzzles</h1>
        <p className={styles.text}>
          Like a chess puzzle, but with Pokémon. Each battle has one winning line: read both Pokémon&apos;s sets, work
          out what the opponent will do, and find the moves that win before you run out of turns.
        </p>
      </section>

      {listed.length === 0 ? (
        <p className={styles.empty}>No battle puzzles yet. Check back soon!</p>
      ) : (
        <ul className={styles.list}>
          {listed.map((p) => (
            <li key={p.id}>
              <Link href={`/play/${p.id}`} className={styles.card}>
                <span className={styles.cardTop}>
                  <span className={styles.number}>#{p.number}</span>
                  <span className={styles.difficulty} data-difficulty={p.difficulty}>
                    {difficultyLabel(p.difficulty)}
                  </span>
                  <span className={styles.status} data-status={p.status}>
                    {STATUS_LABELS[p.status]}
                  </span>
                </span>
                <span className={styles.cardTitle}>{p.title}</span>
                {p.description && <span className={styles.cardText}>{p.description}</span>}
                <span className={styles.turns}>
                  Win within {p.maxTurns} turn{p.maxTurns === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}