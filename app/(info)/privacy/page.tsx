import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '@/lib/site'
import styles from '../info.module.css'

export const metadata: Metadata = {
  title: 'Privacy Policy · PokeGame',
}

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <span className={styles.updated}>Last updated {LEGAL_LAST_UPDATED}</span>

      <p className={styles.lead}>
        PokeGame collects only what it needs to run the games and save your progress. It doesn&apos;t show ads, sell
        data, or use third-party tracking.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>An anonymous player ID.</strong> The first time you play, a random ID is created so your progress
          can be saved. You don&apos;t need to give a name or email address to play.
        </li>
        <li>
          <strong>Your game activity.</strong> Your guesses, the hints you reveal, whether you solved each puzzle, and
          when. This is linked to your player ID.
        </li>
        <li>
          <strong>Google sign-in, if you choose to use it.</strong> If you sign in with Google to keep your progress
          across devices, we receive your email address and basic profile details from Google.
        </li>
        <li>
          <strong>Basic technical information.</strong> Like any website, our hosting and database providers process
          details such as your IP address and browser type to deliver the site and keep it secure.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        PokeGame uses cookies only to keep you signed in, so the site remembers your progress. There are no
        advertising or analytics cookies.
      </p>

      <h2>How we use it</h2>
      <p>
        To run the daily puzzles, save and show your results, prevent the same puzzle from being replayed, and keep
        the site working properly.
      </p>

      <h2>Who else is involved</h2>
      <ul>
        <li>
          <strong>Supabase</strong> stores player IDs, sign-in details, and game activity.
        </li>
        <li>
          <strong>Vercel</strong> hosts the website.
        </li>
        <li>
          <strong>GitHub</strong> serves the Pokémon sprite and item images from PokeAPI, so your browser connects to
          it when images load.
        </li>
      </ul>
      <p>We don&apos;t sell or share your information with anyone else.</p>

      <h2>How long we keep it</h2>
      <p>
        Game activity is kept for as long as PokeGame runs, so your history stays available. You can ask for it to be
        deleted at any time.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Clearing your browser&apos;s cookies starts you fresh as a new anonymous player.</li>
        <li>
          To have your data deleted, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        PokeGame doesn&apos;t ask for names or email addresses to play. Players under 13 shouldn&apos;t use Google
        sign-in. If you believe a child has given us personal information, contact us and we&apos;ll delete it.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top will be updated. Questions? Visit the{' '}
        <Link href="/contact">Contact</Link> page.
      </p>
    </>
  )
}