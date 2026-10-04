'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import SiteHeader from './site-header'
import styles from './play-pokedle.module.css'
import { useSuggestionKeyboard } from '@/lib/use-suggestion-keyboard'

type TypeComparison = 'correct' | 'present' | 'absent'
type ExactOrDirection = 'correct' | 'higher' | 'lower'
type StatusClass = 'cellGood' | 'cellWarn' | 'cellBad'

interface Comparison {
  type1: TypeComparison
  type2: TypeComparison
  generation: ExactOrDirection
  height: ExactOrDirection
  weight: ExactOrDirection
  color: 'correct' | 'absent'
}

interface Attributes {
  dexNumber?: number
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
  dailyDate: string | null
  description: string | null
  pokemonNames: string[]
  initialGuesses: Guess[]
  initialCompleted: boolean
  initialSucceeded: boolean | null
}

function formatDailyDate(dailyDate: string | null): string | null {
  if (!dailyDate) return null

  const date = new Date(`${dailyDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

function statusClass(status: TypeComparison | ExactOrDirection | 'correct' | 'absent'): StatusClass {
  if (status === 'correct') return 'cellGood'
  if (status === 'present') return 'cellWarn'
  return 'cellBad'
}

const STATUS_EMOJI: Record<StatusClass, string> = {
  cellGood: '🟩',
  cellWarn: '🟨',
  cellBad: '🟥',
}

function buildShareText(
  guesses: Guess[],
  succeeded: boolean | null,
  formattedDate: string | null,
  puzzleUrl: string
): string {
  const header = formattedDate ? `Pokédle ${formattedDate}` : 'Pokédle'
  const result = succeeded
    ? `Solved in ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}`
    : `${guesses.length} guess${guesses.length === 1 ? '' : 'es'}`

  const grid = guesses
    .map((g) =>
      [
        g.comparison.type1,
        g.comparison.type2,
        g.comparison.generation,
        g.comparison.height,
        g.comparison.weight,
        g.comparison.color,
      ]
        .map((status) => STATUS_EMOJI[statusClass(status)])
        .join('')
    )
    .join('\n')

  return `${header}\n${result}\n\n${grid}\n\n${puzzleUrl}`
}

function directionArrow(value: ExactOrDirection): string {
  if (value === 'higher') return ' ↑'
  if (value === 'lower') return ' ↓'
  return ''
}

function formatGeneration(gen: string): string {
  return gen.replace('generation-', '').toUpperCase()
}

function formatDex(dexNumber: number | undefined): string {
  if (typeof dexNumber !== 'number') return '—'
  return `No. ${String(dexNumber).padStart(3, '0')}`
}

function Cell({ label, status, dataLabel }: { label: string; status: StatusClass; dataLabel: string }) {
  return (
    <div className={`${styles.cell} ${styles[status]}`} data-label={dataLabel} role="cell">
      <span className={styles.cellValue}>{label}</span>
    </div>
  )
}

export default function PlayPokedle({
  puzzleId,
  dailyDate,
  description,
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
  const [copied, setCopied] = useState(false)

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

    const keyboard = useSuggestionKeyboard({
    listId: 'speciesSuggestions',
    suggestions: filteredNames,
    open: showSuggestions,
    onOpen: () => setShowSuggestions(true),
    onClose: () => setShowSuggestions(false),
    onPick: selectName,
    onSubmit: submitGuess,
  })

  const answerGuess = succeeded ? guesses[guesses.length - 1] : null
  const formattedDate = formatDailyDate(dailyDate)

  async function handleShare() {
    const puzzleUrl = typeof window !== 'undefined' ? window.location.href : ''
    const text = buildShareText(guesses, succeeded, formattedDate, puzzleUrl)

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  return (
    <div className={styles.board}>
      <SiteHeader>
        <div className={styles.meta}>
          {formattedDate && <span>{formattedDate}</span>}
          {formattedDate && <span className={styles.metaDivider}>·</span>}
          <span>
            <strong>{guesses.length}</strong> guess{guesses.length === 1 ? '' : 'es'}
          </span>
        </div>
      </SiteHeader>

      <div className={styles.gameIntro}>
        <h1 className={styles.gameTitle}>Pokédle</h1>
        {description && <p className={styles.tagline}>{description}</p>}
      </div>

      {!completed && (
        <div className={styles.scanBar}>
          <div className={styles.scanInputWrap}>
            <label htmlFor="speciesInput" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
              Species name
            </label>
            <input
              id="speciesInput"
              className={styles.scanInput}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              disabled={submitting}
              placeholder="Enter a species name…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="speciesSuggestions"
              aria-expanded={showSuggestions && filteredNames.length > 0}
              aria-activedescendant={keyboard.activeIndex >= 0 ? `speciesSuggestions-${keyboard.activeIndex}` : undefined}
              onKeyDown={keyboard.onKeyDown}
            />

            {showSuggestions && filteredNames.length > 0 && (
              <ul id="speciesSuggestions" className={styles.suggestList} role="listbox">
                {filteredNames.map((name, i) => (
                  <li
                    key={name}
                    id={`speciesSuggestions-${i}`}
                    className={`${styles.suggestItem} ${i === keyboard.activeIndex ? styles.suggestItemActive : ''}`}
                    role="option"
                    aria-selected={i === keyboard.activeIndex}
                    onMouseEnter={() => keyboard.setActiveIndex(i)}
                    onClick={() => selectName(name)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className={styles.scanButton} onClick={submitGuess} disabled={submitting}>
            Guess
          </button>
        </div>
      )}

      {error && <p className={styles.formNote}>{error}</p>}

      <div className={styles.ledgerWrap}>
        <div className={styles.legend} aria-label="Legend">
          <span className={`${styles.chip} ${styles.chipGood}`}>Correct</span>
          <span className={`${styles.chip} ${styles.chipWarn}`}>Partial</span>
          <span className={`${styles.chip} ${styles.chipBad}`}>Incorrect</span>
        </div>

        <div className={styles.ledger} role="table" aria-label="Guess comparison ledger">
          <div className={styles.ledgerHead} role="row">
            <span role="columnheader">Pokemon</span>
            <span role="columnheader">Type I</span>
            <span role="columnheader">Type II</span>
            <span role="columnheader">Gen</span>
            <span role="columnheader">Height</span>
            <span role="columnheader">Weight</span>
            <span role="columnheader">Color</span>
          </div>

          <div className={styles.ledgerBody} aria-live="polite">
            {guesses.map((g, i) => (
              <div key={i} className={styles.row} role="row">
                <div className={`${styles.cell} ${styles.specimen}`} data-label="Specimen" role="cell">
                  {g.sprite_url && (
                    <img className={styles.sprite} src={g.sprite_url} alt={g.guess} width={44} height={44} />
                  )}
                  <span className={styles.tagText}>
                    <span className={styles.dex}>{formatDex(g.attributes.dexNumber)}</span>
                    <span className={styles.name}>{g.guess}</span>
                  </span>
                </div>

                <Cell label={g.attributes.type1} status={statusClass(g.comparison.type1)} dataLabel="Type I" />
                <Cell label={g.attributes.type2 ?? '—'} status={statusClass(g.comparison.type2)} dataLabel="Type II" />
                <Cell
                  label={`${formatGeneration(g.attributes.generation)}${directionArrow(g.comparison.generation)}`}
                  status={statusClass(g.comparison.generation)}
                  dataLabel="Gen"
                />
                <Cell
                  label={`${g.attributes.height}m${directionArrow(g.comparison.height)}`}
                  status={statusClass(g.comparison.height)}
                  dataLabel="Height"
                />
                <Cell
                  label={`${g.attributes.weight}kg${directionArrow(g.comparison.weight)}`}
                  status={statusClass(g.comparison.weight)}
                  dataLabel="Weight"
                />
                <Cell label={g.attributes.color} status={statusClass(g.comparison.color)} dataLabel="Color" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {completed && (
        succeeded && answerGuess ? (
          <>
            <div className={styles.resultCard}>
              <span className={styles.resultArt}>
                {answerGuess.sprite_url && (
                  <img src={answerGuess.sprite_url} alt={answerGuess.guess} width={96} height={96} />
                )}
              </span>
              <span className={styles.resultInfo}>
                <span className={styles.resultDex}>{formatDex(answerGuess.attributes.dexNumber)}</span>
                <span className={styles.resultName}>{answerGuess.guess}</span>
                <span className={styles.resultTries}>
                  Solved in {guesses.length} guess{guesses.length === 1 ? '' : 'es'}
                </span>
                <button className={styles.shareButton} onClick={handleShare} type="button">
                  {copied ? 'Copied!' : 'Share'}
                </button>
              </span>
            </div>

            <div className={styles.nextSteps}>
              <p className={styles.nextHint}>
                A new Pokémon drops at midnight ET. Tap <strong>PokeGame</strong> in the top left to head back home,
                or try another game.
              </p>
              <Link href="/daily/guess-the-mon" className={styles.nextButton}>
                Play Guess the Pokémon →
              </Link>
            </div>
          </>
        ) : (
          <p className={styles.footerNote}>Puzzle complete.</p>
        )
      )}
    </div>
  )
}