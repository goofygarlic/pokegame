import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL_LAST_UPDATED } from '@/lib/site'
import styles from '../info.module.css'

export const metadata: Metadata = {
  title: 'Terms of Use · PokeGame',
}

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Use</h1>
      <span className={styles.updated}>Last updated {LEGAL_LAST_UPDATED}</span>

      <p className={styles.lead}>
        PokeGame is a free fan project made for fun. By using the site, you agree to these terms.
      </p>

      <h2>Using PokeGame</h2>
      <p>
        You&apos;re welcome to play, share your results, and link to the site. PokeGame is for personal,
        non-commercial use.
      </p>

      <h2>Play fair</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>Try to disrupt the site or overload it with automated requests.</li>
        <li>Try to access other players&apos; data or anything you aren&apos;t meant to see.</li>
        <li>Tamper with scoring or puzzle answers.</li>
      </ul>
      <p>Access may be limited or removed for anyone who does.</p>

      <h2>Your progress</h2>
      <p>
        Progress for anonymous players is tied to your browser. Clearing cookies or switching devices may lose it
        unless you&apos;ve signed in.
      </p>

      <h2>Pokémon and other content</h2>
      <p>
        PokeGame is unofficial and not affiliated with or endorsed by Nintendo, Creatures Inc., GAME FREAK inc., or
        The Pokémon Company. Pokémon names, images, and related marks belong to their respective owners. Pokémon data
        and sprites are provided by <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokeAPI</a>.
      </p>

      <h2>No guarantees</h2>
      <p>
        PokeGame is provided as is. Puzzles or data may occasionally contain mistakes, and the site may change,
        pause, or shut down at any time. To the extent the law allows, PokeGame and its maker aren&apos;t liable for
        any loss or damage from using the site.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        These terms may be updated from time to time, and the date at the top will change when they are. Questions?
        Visit the <Link href="/contact">Contact</Link> page.
      </p>
    </>
  )
}