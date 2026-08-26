import { createClient } from '@/lib/supabase/server'
import AutoSignIn from '@/components/auto-sign-in'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // no session yet; hand off to client component to sign in anon, then server component re-runs via router.refresh().
  if (!user) {
    return <AutoSignIn />
  }

  // prove a real, RLS-protected read against the puzzles table works.
  // count will be 0 since no puzzles created yet
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