'use client'

import type { AnswerReveal } from '@/lib/guess-the-mon'
import {
  BALL_TIERS,
  HINTS,
  WRONG_GUESS_COST,
  ballSpriteUrl,
  calculatePoints,
  getBallTier,
  type HintKey,
  type HintValue,
} from '@/lib/guess-the-mon-config'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import styles from './play-guess-the-mon.module.css'
import SiteHeader from './site-header'

interface PlayGuessTheMonProps {
  puzzleId: string
  dailyDate: string | null
  description: string | null
  pokemonNames: string[]
  initialRevealedHints: HintKey[]
  initialHints: Partial<Record<HintKey, HintValue>>
  initialWrongGuesses: string[]
  initialAnswer: AnswerReveal | null // only set once the puzzle is solved
}

function formatDailyDate(dailyDate: string | null): string | null {
  if (!dailyDate) return null
  const date = new Date(`${dailyDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDex(dexNumber: number): string {
  return `No. ${String(dexNumber).padStart(3, '0')}`
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// "0–4 pts", "5–9 pts", ..., "15+ pts"
function tierRange(index: number): string {
  const low = index === 0 ? 0 : BALL_TIERS[index - 1].below
  const high = BALL_TIERS[index].below
  return Number.isFinite(high) ? `${low}–${high - 1} pts` : `${low}+ pts`
}

function buildShareText(answer: AnswerReveal, points: number, hintCount: number, wrongCount: number, date: string | null, url: string) {
  const tier = getBallTier(points)
  return [
    date ? `Guess the Pokémon ${date}` : 'Guess the Pokémon',
    `🏆 ${tier.name} · ${pluralize(points, 'point')}`,
    `🔍 ${pluralize(hintCount, 'hint')} · ❌ ${wrongCount} wrong ${wrongCount === 1 ? 'guess' : 'guesses'}`,
    '',
    url,
  ].join('\n')
}

export default function PlayGuessTheMon({
  puzzleId,
  dailyDate,
  description,
  pokemonNames,
  initialRevealedHints,
  initialHints,
  initialWrongGuesses,
  initialAnswer,
}: PlayGuessTheMonProps) {
  const [revealedHints, setRevealedHints] = useState<HintKey[]>(initialRevealedHints)
  const [hintValues, setHintValues] = useState<Partial<Record<HintKey, HintValue>>>(initialHints)
  const [wrongGuesses, setWrongGuesses] = useState<string[]>(initialWrongGuesses)
  const [answer, setAnswer] = useState<AnswerReveal | null>(initialAnswer)
  const [pendingHint, setPendingHint] = useState<HintKey | null>(null)
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cryFailed, setCryFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  const solved = answer !== null
  const points = calculatePoints(revealedHints, wrongGuesses.length)
  const tier = getBallTier(points)
  const formattedDate = formatDailyDate(dailyDate)

  const filteredNames = useMemo(() => {
    if (query.trim().length === 0) return []
    const q = query.toLowerCase()
    return pokemonNames.filter((name) => name.includes(q)).slice(0, 8)
  }, [query, pokemonNames])

  async function revealHint(key: HintKey) {
    setError(null)
    setPendingHint(key)

    try {
      const res = await fetch('/api/guess-the-mon/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, hint: key }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setRevealedHints(data.revealedHints)
      setHintValues((prev) => ({ ...prev, [key]: data.value }))
    } finally {
      setPendingHint(null)
    }
  }

  async function submitGuess() {
    setError(null)

    const trimmed = query.trim().toLowerCase()
    if (trimmed.length === 0) return

    if (!pokemonNames.includes(trimmed)) {
      setError('Select a Pokémon from the dropdown list')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/guess-the-mon/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, guess: trimmed }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      if (data.correct) {
        setAnswer(data.answer)
        setHintValues(data.hints)
      } else {
        setWrongGuesses((prev) => [...prev, data.guess])
      }
      setQuery('')
      setShowSuggestions(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleShare() {
    if (!answer) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const text = buildShareText(answer, points, revealedHints.length, wrongGuesses.length, formattedDate, url)

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
            <strong>{points}</strong> {points === 1 ? 'point' : 'points'}
          </span>
        </div>
      </SiteHeader>

      <div className={styles.gameIntro}>
        <h1 className={styles.gameTitle}>Guess the Pokémon</h1>
        <p className={styles.tagline}>
          {description ?? "Name today's Pokemon from its hints!"} Each hint adds points, and fewer points earns a
          better ball.
        </p>
      </div>

      <div className={styles.layout}>
        {/* ---------- left: the mystery card + ball tiers ---------- */}
        <aside className={styles.side}>
          <div className={`${styles.mysteryCard} ${solved ? styles.mysteryCardSolved : ''}`}>
            <span className={styles.mysteryArt}>
              {solved && answer.spriteUrl ? (
                <img src={answer.spriteUrl} alt={answer.name} width={160} height={160} />
              ) : (
                <span className={styles.questionMark} aria-label="Unknown Pokémon">
                  ?
                </span>
              )}
            </span>

            <span className={styles.mysteryDex}>{solved ? formatDex(answer.dexNumber) : 'No. ???'}</span>
            <span className={styles.mysteryName}>{solved ? answer.name : '???'}</span>

            {solved ? (
              <>
                <span className={styles.reward}>
                  <img src={ballSpriteUrl(tier)} alt="" width={32} height={32} />
                  <span>
                    <strong>{tier.name}</strong> · {pluralize(points, 'point')}
                  </span>
                </span>
                <button className={styles.shareButton} onClick={handleShare} type="button">
                  {copied ? 'Copied!' : 'Share'}
                </button>
              </>
            ) : (
              <span className={styles.pointsPill}>{pluralize(points, 'point')} so far</span>
            )}
          </div>

          <div className={styles.tiers}>
            <span className={styles.sectionLabel}>{solved ? 'Your reward' : 'Current pace'}</span>
            <ol className={styles.tierList}>
              {BALL_TIERS.map((t, i) => (
                <li key={t.item} className={`${styles.tier} ${t.item === tier.item ? styles.tierActive : ''}`}>
                  <img src={ballSpriteUrl(t)} alt="" width={28} height={28} />
                  <span className={styles.tierName}>{t.name}</span>
                  <span className={styles.tierRange}>{tierRange(i)}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* ---------- right: guessing + hints ---------- */}
        <section className={styles.main}>
          {!solved && (
            <div className={styles.scanBar}>
              <div className={styles.scanInputWrap}>
                <label htmlFor="mysteryGuess" className={styles.srOnly}>
                  Pokémon name
                </label>
                <input
                  id="mysteryGuess"
                  className={styles.scanInput}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  disabled={submitting}
                  placeholder="Which Pokémon is it?"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitGuess()
                    if (e.key === 'Escape') setShowSuggestions(false)
                  }}
                />

                {showSuggestions && filteredNames.length > 0 && (
                  <ul className={styles.suggestList} role="listbox">
                    {filteredNames.map((name) => (
                      <li
                        key={name}
                        className={styles.suggestItem}
                        role="option"
                        aria-selected={false}
                        onClick={() => {
                          setQuery(name)
                          setShowSuggestions(false)
                        }}
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

          {wrongGuesses.length > 0 && (
            <div className={styles.wrongGuesses}>
              <span className={styles.sectionLabel}>
                Wrong guesses (+{WRONG_GUESS_COST} each)
              </span>
              <ul className={styles.wrongList}>
                {wrongGuesses.map((name) => (
                  <li key={name} className={styles.wrongChip}>
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.hints}>
            <span className={styles.sectionLabel}>{solved ? 'All hints' : 'Hints'}</span>
            <ul className={styles.hintGrid}>
              {HINTS.map((hint) => {
                const value = hintValues[hint.key]
                const paid = revealedHints.includes(hint.key)

                return (
                  <li key={hint.key} className={`${styles.hintTile} ${value ? styles.hintTileOpen : ''}`}>
                    <div className={styles.hintHead}>
                      <span className={styles.hintLabel}>{hint.label}</span>
                      <span className={`${styles.hintCost} ${solved && !paid ? styles.hintCostUnused : ''}`}>
                        +{hint.cost} {hint.cost === 1 ? 'pt' : 'pts'}
                      </span>
                    </div>

                    {value?.kind === 'lines' && (
                      <div className={styles.hintValue}>
                        {value.lines.map((line, i) => (
                          <span key={i}>{line}</span>
                        ))}
                      </div>
                    )}

                    {value?.kind === 'audio' &&
                      (cryFailed ? (
                        <p className={styles.hintNote}>Couldn&apos;t play the cry. Try again in a minute, or use a different browser.</p>
                      ) : (
                        <audio
                          className={styles.cry}
                          controls
                          preload="none"
                          src={`/api/guess-the-mon/cry?puzzleId=${encodeURIComponent(puzzleId)}`}
                          onError={() => setCryFailed(true)}
                        />
                      ))}

                    {!value && !solved && (
                      <button
                        className={styles.revealButton}
                        type="button"
                        onClick={() => revealHint(hint.key)}
                        disabled={pendingHint !== null}
                      >
                        {pendingHint === hint.key ? 'Revealing…' : 'Reveal'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {solved && (
            <div className={styles.nextSteps}>
              <p className={styles.nextHint}>
                A new Pokémon drops at midnight ET. Tap <strong>PokeGame</strong> in the top left to head back home,
                or try another game.
              </p>
              <Link href="/daily/pokedle" className={styles.nextButton}>
                Play Pokédle →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}