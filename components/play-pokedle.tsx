'use client'

import { useState } from 'react'

type Feedback = 'correct' | 'present' | 'absent'
type Guess = { guess: string; feedback: Feedback[] }

interface PlayPokedleProps {
  puzzleId: string
  pokemonLength: number
  maxGuesses: number
  initialGuesses: Guess[]
  initialCompleted: boolean
  initialSucceeded: boolean | null
}

const FEEDBACK_COLORS: Record<Feedback, string> = {
  correct: '#6aaa64',
  present: '#c9b458',
  absent: '#787c7e',
}

export default function PlayPokedle({
  puzzleId,
  pokemonLength,
  maxGuesses,
  initialGuesses,
  initialCompleted,
  initialSucceeded,
}: PlayPokedleProps) {
  const [guesses, setGuesses] = useState<Guess[]>(initialGuesses)
  const [currentGuess, setCurrentGuess] = useState('')
  const [completed, setCompleted] = useState(initialCompleted)
  const [succeeded, setSucceeded] = useState<boolean | null>(initialSucceeded)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submitGuess() {
    setError(null)

    if (currentGuess.length !== pokemonLength) {
      setError(`Guess must be ${pokemonLength} letters`)
      return
    }

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
        { guess: currentGuess.toLowerCase(), feedback: data.feedback },
      ])
      setCompleted(data.completed)
      setSucceeded(data.succeeded)
      if (data.answer) setAnswer(data.answer)
      setCurrentGuess('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 400 }}>
      <div style={{ marginBottom: 16 }}>
        {guesses.map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            {g.guess.split('').map((letter, j) => (
              <div
                key={j}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  backgroundColor: FEEDBACK_COLORS[g.feedback[j]],
                }}
              >
                {letter}
              </div>
            ))}
          </div>
        ))}
      </div>

      {completed ? (
        <p>
          {succeeded
            ? 'Solved it! 🎉'
            : `Out of guesses. The answer was ${answer ?? '???'}.`}
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={currentGuess}
            onChange={(e) => setCurrentGuess(e.target.value.toLowerCase())}
            maxLength={pokemonLength}
            disabled={submitting}
            placeholder={`${pokemonLength}-letter Pokemon name`}
            style={{ padding: 8, flex: 1 }}
          />
          <button onClick={submitGuess} disabled={submitting}>
            Guess
          </button>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p style={{ marginTop: 8, color: '#666' }}>
        {guesses.length} / {maxGuesses} guesses used
      </p>
    </div>
  )
}