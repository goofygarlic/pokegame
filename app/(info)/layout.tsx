import type { ReactNode } from 'react'
import SiteHeader from '@/components/site-header'
import styles from './info.module.css'

// Shared shell for About, Privacy Policy, Contact, and Terms of Use.
// The (info) folder name is a route group, so it doesn't appear in the URL.
export default function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <SiteHeader />
      <article className={styles.article}>{children}</article>
    </main>
  )
}