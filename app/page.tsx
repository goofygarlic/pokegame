import { createClient } from '@/lib/supabase/server'
import AutoSignIn from '@/components/auto-sign-in'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session yet — hand off to the client component to sign in
  // anonymously, then this server component re-runs via router.refresh().
  if (!user) {
    return <AutoSignIn />
  }

  // Prove a real, RLS-protected read against the puzzles table works.
  // Count will be 0 right now since no puzzles have been created yet —
  // that's expected and fine, it's the connection we're testing.
  const { count, error } = await supabase
    .from('puzzles')
    .select('*', { count: 'exact', head: true })

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Supabase connection check</h1>
      <p>
        Signed in as: <code>{user.id}</code>
      </p>
      <p>Anonymous: {user.is_anonymous ? 'yes' : 'no'}</p>
      <p>
        Published puzzles found:{' '}
        {error ? `error: ${error.message}` : count}
      </p>
    </main>
  )
}