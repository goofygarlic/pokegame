'use client'

import { useMemo, useState } from 'react'

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

interface Attributes {
  type1: string
  type2: string | null
  generation: string
  height: number
  weight: number
  color: string
}

interface Guess {
  guess: string
  sprite_url: string | null
  attributes: Attributes
  comparison: Comparison
}

interface PlayPokedleProps {
  puzzleId: string
  pokemonNames: string[]
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
  if (value === 'higher') return ' ↑'
  if (value === 'lower') return ' ↓'
  return ''
}

function formatGeneration(gen: string): string {
  return gen.replace('generation-', '').toUpperCase()
}

function Cell({ label, status }: { label: string; status: string }) {
  return (
    <div
      style={{
        width: 90,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 13,
        fontWeight: 'bold',
        textTransform: 'capitalize',
        backgroundColor: CELL_COLORS[status] ?? '#787c7e',
        borderRadius: 4,
        textAlign: 'center',
        padding: '0 4px',
      }}
    >
      {label}
    </div>
  )
}

export default function PlayPokedle({
  puzzleId,
  pokemonNames,
  initialGuesses,
  initialCompleted,
  initialSucceeded,
}: PlayPokedleProps) {
  const [guesses, setGuesses] = useState<Guess[]>(initialGuesses)
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [completed, setCompleted] = useState(initialCompleted)
  const [succeeded, setSucceeded] = useState<boolean | null>(initialSucceeded)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const filteredNames = useMemo(() => {
    if (query.trim().length === 0) return []
    const q = query.toLowerCase()
    return pokemonNames.filter((name) => name.includes(q)).slice(0, 8)
  }, [query, pokemonNames])

  function selectName(name: string) {
    setQuery(name)
    setShowSuggestions(false)
  }

  async function submitGuess() {
    setError(null)

    const trimmed = query.trim().toLowerCase()
    if (trimmed.length === 0) return

    if (!pokemonNames.includes(trimmed)) {
      setError('Select a Pokemon from the dropdown list')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/attempts/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, guess: trimmed }),
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
          attributes: data.attributes,
          comparison: data.comparison,
        },
      ])
      setCompleted(data.completed)
      setSucceeded(data.succeeded)
      setQuery('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 700 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, fontSize: 12, color: '#999' }}>
        <div style={{ width: 100 }}>Pokemon</div>
        <div style={{ width: 90 }}>Type 1</div>
        <div style={{ width: 90 }}>Type 2</div>
        <div style={{ width: 90 }}>Gen</div>
        <div style={{ width: 90 }}>Height</div>
        <div style={{ width: 90 }}>Weight</div>
        <div style={{ width: 90 }}>Color</div>
      </div>

      {guesses.map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <div
            style={{
              width: 100,
              textTransform: 'capitalize',
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {g.sprite_url && (
              <img src={g.sprite_url} alt={g.guess} width={64} height={64} />
            )}
            {g.guess}
          </div>
          <Cell label={g.attributes.type1} status={g.comparison.type1} />
          <Cell label={g.attributes.type2 ?? 'None'} status={g.comparison.type2} />
          <Cell
            label={`${formatGeneration(g.attributes.generation)}${directionArrow(g.comparison.generation)}`}
            status={g.comparison.generation}
          />
          <Cell
            label={`${g.attributes.height}${directionArrow(g.comparison.height)}`}
            status={g.comparison.height}
          />
          <Cell
            label={`${g.attributes.weight}${directionArrow(g.comparison.weight)}`}
            status={g.comparison.weight}
          />
          <Cell label={g.attributes.color} status={g.comparison.color} />
        </div>
      ))}

      {completed ? (
        <p style={{ marginTop: 16 }}>
          {succeeded ? 'Solved it!' : 'Puzzle complete.'}
        </p>
      ) : (
        <div style={{ position: 'relative', marginTop: 16, maxWidth: 300 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              disabled={submitting}
              placeholder="Type a Pokemon name..."
              style={{ padding: 8, flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitGuess()
                if (e.key === 'Escape') setShowSuggestions(false)
              }}
            />
            <button onClick={submitGuess} disabled={submitting}>
              Guess
            </button>
          </div>

          {showSuggestions && filteredNames.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                margin: 0,
                padding: 0,
                listStyle: 'none',
                background: 'white',
                border: '1px solid #ccc',
                borderRadius: 4,
                zIndex: 10,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {filteredNames.map((name) => (
                <li
                  key={name}
                  onClick={() => selectName(name)}
                  style={{
                    padding: 8,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    color: '#111',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
      <p style={{ marginTop: 8, color: '#666' }}>{guesses.length} guesses made</p>
    </div>
  )
}