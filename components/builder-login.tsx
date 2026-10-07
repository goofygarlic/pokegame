'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './battle-builder.module.css'

// Asks for BATTLE_BUILDER_SECRET once; the server then remembers this browser for 30 days.
export default function BuilderLogin() {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/battle/builder/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim() }),
      })
      // A missing route or server crash returns an HTML page, not JSON, so read it carefully.
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `The server answered with an error (${res.status}).`)
        return
      }
      router.refresh()
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.login} onSubmit={submit}>
      <h1 className={styles.pageTitle}>Battle puzzle builder</h1>
      <p className={styles.hint}>Enter the builder secret (BATTLE_BUILDER_SECRET) to unlock the builder in this browser.</p>
      <label className={styles.field}>
        <span className={styles.label}>Builder secret</span>
        <input
          className={styles.input}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className={styles.errorText}>{error}</p>}
      <button className={styles.primaryButton} type="submit" disabled={busy || secret.length === 0}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  )
}