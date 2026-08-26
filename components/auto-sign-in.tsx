'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AutoSignIn() {
  const [status, setStatus] = useState('Signing you in...')
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.signInAnonymously().then(({ error }) => {
      if (error) {
        setStatus(`Sign-in failed: ${error.message}`)
        return
      }
      setStatus('Signed in! Loading...')
      // re-runs server component (app/page.tsx) now that session cookie exists, picks up logged-in state
      router.refresh()
    })
  }, [router])

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Supabase connection check</h1>
      <p>{status}</p>
    </main>
  )
}