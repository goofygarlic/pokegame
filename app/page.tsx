import Link from 'next/link'
import SiteHeader from '@/components/site-header'
import { BALL_TIERS, ballSpriteUrl } from '@/lib/guess-the-mon-config'
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
          <span className={styles.eyebrow}>Daily</span>
          <h2 className={styles.cardTitle}>Guess the Pokémon</h2>
          <p className={styles.cardText}>
            Reveal hints like its weaknesses, egg groups, or cry, then name the Pokémon. Use fewer hints to earn a
            better ball.
          </p>
          <div className={styles.balls} aria-hidden="true">
            {BALL_TIERS.map((tier) => (
              <img key={tier.item} src={ballSpriteUrl(tier)} alt="" width={28} height={28} />
            ))}
          </div>
          <Link href="/daily/guess-the-mon" className={styles.primaryButton}>
            Play Guess the Pokémon
          </Link>
        </article>
      </section>
    </main>
  )
}