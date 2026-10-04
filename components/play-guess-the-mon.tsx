import Link from 'next/link'
import SiteHeader from './site-header'
import styles from './play-guess-the-mon.module.css'

// Guess the Pokémon game UI. For now this is a "coming soon" placeholder;
// the real game will replace the contents of this component.
export default function PlayGuessTheMon() {
  return (
    <div className={styles.board}>
      <SiteHeader />

      <section className={styles.placeholder}>
        <span className={styles.eyebrow}>Coming soon</span>
        <h1 className={styles.title}>Guess the Pokémon</h1>
        <p className={styles.text}>
          Name the Pokémon from a set of hints, revealing more clues as you go. This one is still being built, so check
          back soon.
        </p>
        <Link href="/" className={styles.backButton}>
          Back to all games
        </Link>
      </section>
    </div>
  )
}