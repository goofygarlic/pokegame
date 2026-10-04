import Link from 'next/link'
import SiteHeader from '@/components/site-header'
import styles from './home.module.css'

const SAMPLE_ROW = ['good', 'warn', 'good', 'bad', 'bad', 'good'] as const

export default function Home() {
  return (
    <main className={styles.page}>
      <SiteHeader />

      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Daily Pokémon puzzles</h1>
        <p className={styles.heroText}>
          A new puzzle every day at midnight ET. Same Pokémon for everyone, so you can compare results with friends.
        </p>
      </section>

      <section className={styles.games} aria-label="Games">
        <article className={styles.card}>
          <span className={styles.eyebrow}>Daily</span>
          <h2 className={styles.cardTitle}>Pokédle</h2>
          <p className={styles.cardText}>
            Guess today&apos;s Pokémon. Each guess shows how its type, generation, height, weight, and color compare to
            the answer.
          </p>
          <div className={styles.sample} aria-hidden="true">
            {SAMPLE_ROW.map((status, i) => (
              <span key={i} className={`${styles.square} ${styles[status]}`} />
            ))}
          </div>
          <Link href="/daily/pokedle" className={styles.primaryButton}>
            Play today&apos;s Pokédle
          </Link>
        </article>

        <article className={styles.card}>
          <span className={styles.eyebrow}>Coming soon</span>
          <h2 className={styles.cardTitle}>Guess the Pokémon</h2>
          <p className={styles.cardText}>
            Name the Pokémon from a set of hints, revealing more clues as you go.
          </p>
          <Link href="daily/guess-the-mon" className={styles.secondaryButton}>
            Preview
          </Link>
        </article>
      </section>
    </main>
  )
}