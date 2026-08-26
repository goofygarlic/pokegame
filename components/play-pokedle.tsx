'use client'

import { useState } from 'react'

type TypeComparison = 'correct' | 'present' | 'absent'
type ExactOrDirection = 'correct' | 'higher' | 'lower'

interface Comparison {
  type1: TypeComparison
  type2: TypeComparison
  generation: ExactOrDirection
  height: ExactOrDirection
  weight: ExactOrDirection
  color: 'correct' | 'absent'
}

interface Guess {
  guess: string
  sprite_url: string | null
  comparison: Comparison
}

interface PlayPokedleProps {
  puzzleId: string
  initialGuesses: Guess[]
  initialCompleted: boolean
  initialSucceeded: boolean | null
}

const CELL_COLORS: Record<string, string> = {
  correct: '#6aaa64',
  present: '#c9b458',
  absent: '#787c7e',
  higher: '#c9b458',
  lower: '#c9b458',
}

function directionArrow(value: ExactOrDirection): string {
  if (value === 'higher') return '↑'
  if (value === 'lower') return '↓'
  return ''
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        width: 72,
        height: 56,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'capitalize',
        backgroundColor: CELL_COLORS[value] ?? '#787c7e',
        borderRadius: 4,
      }}
    >
      <span>{label}</span>
    </div>
  )
}

export default function PlayPokedle({
  puzzleId,
  initialGuesses,
  initialCompleted,
  initialSucceeded,
}: PlayPokedleProps) {
  const [guesses, setGuesses] = useState<Guess[]>(initialGuesses)
  const [currentGuess, setCurrentGuess] = useState('')
  const [completed, setCompleted] = useState(initialCompleted)
  const [succeeded, setSucceeded] = useState<boolean | null>(initialSucceeded)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submitGuess() {
    setError(null)

    if (currentGuess.trim().length === 0) return

    setSubmitting(true)

    try {
      const res = await fetch('/api/attempts/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, guess: currentGuess }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setGuesses((prev) => [
        ...prev,
        {
          guess: data.guessName,
          sprite_url: data.spriteUrl,
          comparison: data.comparison,
        },
      ])
      setCompleted(data.completed)
      setSucceeded(data.succeeded)
      setCurrentGuess('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 600 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, fontSize: 12, color: '#999' }}>
        <div style={{ width: 72 }}>Pokemon</div>
        <div style={{ width: 72 }}>Type 1</div>
        <div style={{ width: 72 }}>Type 2</div>
        <div style={{ width: 72 }}>Gen</div>
        <div style={{ width: 72 }}>Height</div>
        <div style={{ width: 72 }}>Weight</div>
        <div style={{ width: 72 }}>Color</div>
      </div>

      {guesses.map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <div style={{ width: 72, textTransform: 'capitalize', fontSize: 13 }}>
            {g.sprite_url && (
              <img src={g.sprite_url} alt={g.guess} width={32} height={32} />
            )}
            {g.guess}
          </div>
          <Cell label={g.comparison.type1} value={g.comparison.type1} />
          <Cell label={g.comparison.type2} value={g.comparison.type2} />
          <Cell
            label={`${g.comparison.generation} ${directionArrow(g.comparison.generation)}`}
            value={g.comparison.generation}
          />
          <Cell
            label={`${g.comparison.height} ${directionArrow(g.comparison.height)}`}
            value={g.comparison.height}
          />
          <Cell
            label={`${g.comparison.weight} ${directionArrow(g.comparison.weight)}`}
            value={g.comparison.weight}
          />
          <Cell label={g.comparison.color} value={g.comparison.color} />
        </div>
      ))}

      {completed ? (
        <p style={{ marginTop: 16 }}>
          {succeeded ? 'Puzzle Complete!' : 'Puzzle complete.'}
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            value={currentGuess}
            onChange={(e) => setCurrentGuess(e.target.value)}
            disabled={submitting}
            placeholder="Enter a Pokemon name"
            style={{ padding: 8, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
          />
          <button onClick={submitGuess} disabled={submitting}>
            Guess
          </button>
        </div>
      )}

      {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
      <p style={{ marginTop: 8, color: '#666' }}>{guesses.length} guesses made</p>
    </div>
  )
}