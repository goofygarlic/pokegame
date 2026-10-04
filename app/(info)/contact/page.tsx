import type { Metadata } from 'next'
import { CONTACT_EMAIL } from '@/lib/site'
import styles from '../info.module.css'

export const metadata: Metadata = {
  title: 'Contact · PokeGame',
}

const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('PokeGame feedback')}`

export default function ContactPage() {
  return (
    <>
      <h1>Contact</h1>
      <p className={styles.lead}>
        Found a bug, have an idea for a new game, or want your data deleted? Send an email and I&apos;ll get back to
        you.
      </p>

      <div className={styles.emailCard}>
        <span className={styles.emailAddress}>{CONTACT_EMAIL}</span>
        <a href={MAILTO} className={styles.emailButton}>
          Send an email
        </a>
      </div>

      <h2>What helps</h2>
      <ul>
        <li>
          <strong>Bugs:</strong> which game, the date of the puzzle, what you expected, what happened instead, and
          your device and browser.
        </li>
        <li>
          <strong>Data deletion:</strong> roughly when you played, and the email address you signed in with if you
          used Google sign-in.
        </li>
        <li>
          <strong>Ideas:</strong> anything goes, from new hints to whole new games.
        </li>
      </ul>
    </>
  )
}