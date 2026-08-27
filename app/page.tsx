import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>PokeGame</h1>
      <p>Pokemon-themed puzzles!</p>

      <Link
        href="/daily"
        style={{
          display: 'inline-block',
          marginTop: 16,
          padding: '12px 24px',
          background: '#3b4cca',
          color: 'white',
          borderRadius: 6,
          textDecoration: 'none',
          fontWeight: 'bold',
        }}
      >
        Play Today's Pokedle
      </Link>
    </main>
  )
}