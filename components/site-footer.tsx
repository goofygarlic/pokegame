import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'
import styles from './site-footer.module.css'

const FOOTER_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/contact', label: 'Contact' },
  { href: '/terms', label: 'Terms of Use' },
]

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav aria-label="Footer">
          <ul className={styles.links}>
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className={styles.fine}>
          © {new Date().getFullYear()} {SITE_NAME}. An unofficial fan project, not affiliated with or endorsed by
          Nintendo, Creatures Inc., GAME FREAK inc., or The Pokémon Company. Pokémon data and sprites from{' '}
          <a href="https://pokeapi.co" className={styles.link} target="_blank" rel="noreferrer">
            PokeAPI
          </a>
          .
        </p>
      </div>
    </footer>
  )
}