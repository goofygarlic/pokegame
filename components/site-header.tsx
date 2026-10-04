import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './site-header.module.css'

export default function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        PokeGame
      </Link>
      {children && <div className={styles.aside}>{children}</div>}
    </header>
  )
}