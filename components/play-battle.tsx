'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import SiteHeader from './site-header'
import styles from './play-battle.module.css'
import {
  choiceLabel,
  difficultyLabel,
  displaySpecies,
  type BattleEvent,
  type BattlePuzzleInfo,
  type BattleReveal,
  type BattleView,
  type MonState,
  type MoveInfo,
  type PlayerChoice,
  type SetSummary,
} from '@/lib/battle/types'

// How long each line of the battle log stays before the next one appears (ms).
const EVENT_DELAY = 650

type Mode = 'live' | 'practice' | 'replay'

interface PlayBattleProps {
  puzzle: BattlePuzzleInfo
  initialView: BattleView
  initialReveal: BattleReveal | null
}

function hpPercent(hp: number, maxhp: number): number {
  return maxhp > 0 ? Math.max(0, Math.min(100, (hp / maxhp) * 100)) : 0
}

function hpLevel(percent: number): 'high' | 'mid' | 'low' {
  return percent > 50 ? 'high' : percent > 20 ? 'mid' : 'low'
}

const STATUS_LABELS: Record<string, string> = { par: 'PAR', brn: 'BRN', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' }
const STAT_LABELS: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' }

// HP for each side as of the last event shown, falling back to the view's final state.
function hpAt(events: BattleEvent[], count: number, side: 'player' | 'opponent', fallback: MonState) {
  for (let i = Math.min(count, events.length) - 1; i >= 0; i--) {
    const hp = events[i].hp
    if (hp && hp.side === side) return { hp: hp.hp, maxhp: hp.maxhp || fallback.maxhp }
  }
  return { hp: fallback.hp, maxhp: fallback.maxhp }
}

// The form each side is in as of the last event shown (Mega Evolution, Primal Reversion, Zen Mode, ...).
function speciesAt(events: BattleEvent[], count: number, side: 'player' | 'opponent', fallback: string): string {
  for (let i = Math.min(count, events.length) - 1; i >= 0; i--) {
    const forme = events[i].forme
    if (forme && forme.side === side) return forme.species
  }
  return fallback
}

function lineText(line: BattleReveal['solution']): string {
  return line.map(choiceLabel).join(' → ')
}

function buildShareText(puzzle: BattlePuzzleInfo, view: BattleView, url: string): string {
  const result =
    view.outcome === 'win'
      ? `✅ Won in ${view.turnsPlayed} turn${view.turnsPlayed === 1 ? '' : 's'}`
      : `❌ Defeated on turn ${Math.max(1, view.turnsPlayed)}`
  return [`PokeGame Battle Puzzle`, `"${puzzle.title}" (${difficultyLabel(puzzle.difficulty)})`, result, '', url].join('\n')
}

function MonPanel({
  mon,
  species,
  hp,
  side,
  spriteUrl,
}: {
  mon: MonState
  species: string
  hp: { hp: number; maxhp: number }
  side: 'player' | 'opponent'
  spriteUrl: string | null
}) {
  const percent = hpPercent(hp.hp, hp.maxhp)
  const boosts = Object.entries(mon.boosts)
  const name = displaySpecies(species)

  return (
    <div className={`${styles.monRow} ${side === 'player' ? styles.monRowPlayer : styles.monRowOpponent}`}>
      <div className={styles.infoBox}>
        <div className={styles.infoTop}>
          <span className={styles.monName}>{name}</span>
          <span className={styles.monLevel}>Lv. {mon.level}</span>
        </div>
        <div className={styles.hpRow}>
          <span className={styles.hpLabel}>HP</span>
          <span className={styles.hpTrack} role="meter" aria-valuemin={0} aria-valuemax={hp.maxhp} aria-valuenow={hp.hp} aria-label={`${name} HP`}>
            <span className={styles.hpFill} data-level={hpLevel(percent)} style={{ width: `${percent}%` }} />
          </span>
        </div>
        <div className={styles.infoBottom}>
          <span className={styles.typeList}>
            {mon.types.map((t) => (
              <span key={t} className={styles.typeChip} data-type={t}>
                {t}
              </span>
            ))}
            {mon.teraType && <span className={styles.teraChip}>Tera</span>}
            {mon.status && (
              <span className={styles.statusChip} data-status={mon.status}>
                {STATUS_LABELS[mon.status] ?? mon.status}
              </span>
            )}
          </span>
          <span className={styles.hpNumbers}>
            {side === 'player' ? `${hp.hp} / ${hp.maxhp}` : `${Math.ceil(percent)}%`}
          </span>
        </div>
        {boosts.length > 0 && (
          <div className={styles.boosts}>
            {boosts.map(([stat, stage]) => (
              <span key={stat} className={stage > 0 ? styles.boostUp : styles.boostDown}>
                {STAT_LABELS[stat] ?? stat} {stage > 0 ? `+${stage}` : stage}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className={styles.spriteSpot}>
        {spriteUrl ? (
          <img
            className={`${styles.sprite} ${hp.hp === 0 ? styles.spriteFainted : ''}`}
            src={spriteUrl}
            alt={name}
            width={side === 'player' ? 144 : 128}
            height={side === 'player' ? 144 : 128}
          />
        ) : (
          <span className={styles.spriteMissing}>{name}</span>
        )}
      </span>
    </div>
  )
}

function MoveButton({ move, onClick, disabled }: { move: MoveInfo; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className={styles.moveButton}
      data-type={move.type}
      onClick={onClick}
      disabled={disabled || move.disabled}
      title={move.description}
    >
      <span className={styles.moveName}>{move.name}</span>
      <span className={styles.moveMeta}>
        <span>{move.type}</span>
        <span>
          PP {move.pp}/{move.maxpp}
        </span>
      </span>
    </button>
  )
}

function StatGrid({ stats }: { stats: SetSummary['stats'] }) {
  return (
    <div className={styles.statGrid}>
      {Object.entries(stats).map(([stat, value]) => (
        <span key={stat} className={styles.stat}>
          <span className={styles.statName}>{stat === 'hp' ? 'HP' : STAT_LABELS[stat]}</span>
          <span className={styles.statValue}>{value}</span>
        </span>
      ))}
    </div>
  )
}

function SetCard({ title, set, showTera, children }: { title: string; set: SetSummary; showTera: boolean; children?: React.ReactNode }) {
  return (
    <section className={styles.setCard}>
      <span className={styles.sectionLabel}>{title}</span>
      <div className={styles.setHead}>
        {set.spriteUrl && <img className={styles.setSprite} src={set.spriteUrl} alt="" width={56} height={56} />}
        <div className={styles.setTitle}>
          <span className={styles.setName}>{set.species}</span>
          <span className={styles.setLevel}>Lv. {set.level}</span>
        </div>
      </div>
      <dl className={styles.setFacts}>
        <dt>Item</dt>
        <dd>{set.item ?? 'None'}</dd>
        <dt>Ability</dt>
        <dd>{set.ability ?? 'None'}</dd>
        <dt>Nature</dt>
        <dd>{set.nature}</dd>
        {showTera && (
          <>
            <dt>Tera Type</dt>
            <dd>{set.teraType ?? '—'}</dd>
          </>
        )}
      </dl>
      <StatGrid stats={set.stats} />
      {set.transform && (
        <div className={styles.transformBox}>
          <span className={styles.transformTitle}>
            {set.transform.kind === 'mega'
              ? `Can Mega Evolve into ${displaySpecies(set.transform.species)}`
              : `Becomes ${displaySpecies(set.transform.species)} as soon as it enters battle`}
          </span>
          <span className={styles.transformFacts}>
            {set.transform.types.map((t) => (
              <span key={t} className={styles.typeChip} data-type={t}>
                {t}
              </span>
            ))}
            <span>Ability: {set.transform.ability}</span>
          </span>
          <StatGrid stats={set.transform.stats} />
        </div>
      )}
      <ul className={styles.setMoves}>
        {set.moves.map((m) => (
          <li key={m.id} className={styles.setMove}>
            <span className={styles.setMoveTop}>
              <span className={styles.typeChip} data-type={m.type}>
                {m.type}
              </span>
              <span className={styles.setMoveName}>{m.name}</span>
              <span className={styles.setMoveStats}>
                {m.category === 'Status' ? 'Status' : `${m.category} ${m.basePower || '—'}`}
                {m.priority !== 0 && ` · Priority ${m.priority > 0 ? '+' : ''}${m.priority}`}
              </span>
            </span>
            <span className={styles.setMoveDesc}>{m.description}</span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}

export default function PlayBattle({ puzzle, initialView, initialReveal }: PlayBattleProps) {
  const [mode, setMode] = useState<Mode>('live')
  const [view, setView] = useState<BattleView>(initialView)
  const [shownCount, setShownCount] = useState(initialView.events.length)
  const [reveal, setReveal] = useState<BattleReveal | null>(initialReveal)
  const [liveResult, setLiveResult] = useState<BattleView | null>(initialView.outcome === 'ongoing' ? null : initialView)
  const [practiceChoices, setPracticeChoices] = useState<PlayerChoice[]>([])
  const [tera, setTera] = useState(false)
  const [mega, setMega] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const logRef = useRef<HTMLOListElement>(null)

  const animating = shownCount < view.events.length

  // Reveal new log lines one at a time so the turn plays out.
  useEffect(() => {
    if (!animating) return
    const next = view.events[shownCount]
    const delay = next && !next.text ? 0 : next?.kind === 'turn' ? EVENT_DELAY / 2 : EVENT_DELAY
    const timer = setTimeout(() => setShownCount((c) => c + 1), delay)
    return () => clearTimeout(timer)
  }, [animating, shownCount, view.events])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [shownCount])

  const playerHp = hpAt(view.events, shownCount, 'player', view.player)
  const opponentHp = hpAt(view.events, shownCount, 'opponent', view.opponent)
  const playerSpecies = speciesAt(view.events, shownCount, 'player', view.player.species)
  const opponentSpecies = speciesAt(view.events, shownCount, 'opponent', view.opponent.species)
  const playerSprite = puzzle.formSprites.player[playerSpecies] ?? puzzle.playerBackSprite ?? puzzle.player.spriteUrl
  const opponentSprite = puzzle.formSprites.opponent[opponentSpecies] ?? puzzle.opponent.spriteUrl
  const shownEvents = view.events.slice(0, shownCount).filter((e) => e.text)
  const finished = view.outcome !== 'ongoing' && !animating
  const canAct = view.outcome === 'ongoing' && !animating && !submitting && mode !== 'replay'

  // Shows a new view, playing only the lines that weren't on screen yet.
  function showView(next: BattleView, fromStart = false) {
    setShownCount(fromStart ? 0 : view.events.length <= next.events.length ? view.events.length : 0)
    setView(next)
  }

  async function chooseMove(move: MoveInfo) {
    setError(null)
    setSubmitting(true)
    const useTera = tera && !!view.canTera
    const useMega = mega && !!view.canMega
    try {
      if (mode === 'practice') {
        const choices = [...practiceChoices, { move: move.id, tera: useTera, mega: useMega }]
        const res = await fetch('/api/battle/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ puzzleId: puzzle.id, choices }),
        })
        const data = await res.json()
        if (!res.ok) return setError(data.error ?? 'Something went wrong')
        setPracticeChoices(choices)
        showView(data.view)
      } else {
        const res = await fetch('/api/battle/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ puzzleId: puzzle.id, move: move.id, tera: useTera, mega: useMega }),
        })
        const data = await res.json()
        if (!res.ok) return setError(data.error ?? 'Something went wrong')
        showView(data.view)
        if (data.reveal) {
          setReveal(data.reveal)
          setLiveResult(data.view)
        }
      }
      setTera(false)
      setMega(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function startPractice() {
    setError(null)
    const res = await fetch('/api/battle/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId: puzzle.id, choices: [] }),
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error ?? 'Something went wrong')
    setMode('practice')
    setPracticeChoices([])
    setTera(false)
    setMega(false)
    showView(data.view, true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function watchAnswer() {
    if (!reveal) return
    setMode('replay')
    showView(reveal.solutionView, true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function backToResult() {
    if (!liveResult) return
    setMode('live')
    setView(liveResult)
    setShownCount(liveResult.events.length)
  }

  async function handleShare() {
    if (!liveResult) return
    try {
      await navigator.clipboard.writeText(buildShareText(puzzle, liveResult, window.location.href))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  const won = liveResult?.outcome === 'win'

  return (
    <div className={styles.board}>
      <SiteHeader>
        <div className={styles.meta}>
          <span>{difficultyLabel(puzzle.difficulty)}</span>
          <span className={styles.metaDivider}>·</span>
          <span>
            Turn <strong>{Math.min(view.turnsPlayed + (view.outcome === 'ongoing' ? 1 : 0), view.maxTurns)}</strong> of {view.maxTurns}
          </span>
        </div>
      </SiteHeader>

      <div className={styles.gameIntro}>
        <span className={styles.eyebrow}>
          <Link href="/battle">Battle puzzles</Link>
        </span>
        <h1 className={styles.gameTitle}>{puzzle.title}</h1>
        {puzzle.description && <p className={styles.tagline}>{puzzle.description}</p>}
        <p className={styles.goal}>
          Win within <strong>{puzzle.maxTurns} turn{puzzle.maxTurns === 1 ? '' : 's'}</strong>.
          {puzzle.allowTera && ' You can terastallize once.'}
        </p>
      </div>

      {mode !== 'live' && (
        <div className={styles.modeBanner}>
          <span>{mode === 'practice' ? 'Practice mode: this battle is not scored.' : 'Watching the answer.'}</span>
          <button type="button" className={styles.linkButton} onClick={backToResult}>
            Back to your result
          </button>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.field}>
            <MonPanel mon={view.opponent} species={opponentSpecies} hp={opponentHp} side="opponent" spriteUrl={opponentSprite} />
            <MonPanel mon={view.player} species={playerSpecies} hp={playerHp} side="player" spriteUrl={playerSprite} />
          </div>

          <ol className={styles.log} ref={logRef} aria-live="polite">
            {shownEvents.map((e, i) => (
              <li key={i} className={styles[`log_${e.kind}`]}>
                {e.text}
              </li>
            ))}
          </ol>

          {view.outcome === 'ongoing' && mode !== 'replay' && (
            <div className={styles.actions}>
              <div className={styles.actionsHead}>
                <span className={styles.prompt}>What will {displaySpecies(playerSpecies)} do?</span>
                <span className={styles.gimmicks}>
                  {view.canMega && (
                    <label className={`${styles.teraToggle} ${mega ? styles.megaOn : ''}`}>
                      <input
                        type="checkbox"
                        checked={mega}
                        onChange={(e) => {
                          setMega(e.target.checked)
                          if (e.target.checked) setTera(false) // only one per turn
                        }}
                        disabled={!canAct}
                      />
                      Mega Evolve ({displaySpecies(view.canMega)})
                    </label>
                  )}
                  {view.canTera && (
                    <label className={`${styles.teraToggle} ${tera ? styles.teraOn : ''}`}>
                      <input
                        type="checkbox"
                        checked={tera}
                        onChange={(e) => {
                          setTera(e.target.checked)
                          if (e.target.checked) setMega(false)
                        }}
                        disabled={!canAct}
                      />
                      Terastallize ({view.canTera})
                    </label>
                  )}
                </span>
              </div>
              <div className={styles.moveGrid}>
                {view.moves.map((m) => (
                  <MoveButton key={m.id} move={m} onClick={() => chooseMove(m)} disabled={!canAct} />
                ))}
              </div>
            </div>
          )}

          {error && <p className={styles.formNote}>{error}</p>}

          {mode === 'live' && finished && liveResult && (
            <div className={`${styles.resultCard} ${won ? styles.resultWin : styles.resultLoss}`}>
              <span className={styles.resultTitle}>{won ? 'You won!' : 'Defeated'}</span>
              <span className={styles.resultText}>
                {won
                  ? `Solved in ${liveResult.turnsPlayed} turn${liveResult.turnsPlayed === 1 ? '' : 's'}.`
                  : liveResult.lossReason ?? 'You lost the battle.'}
              </span>
              <button type="button" className={styles.shareButton} onClick={handleShare}>
                {copied ? 'Copied!' : 'Share'}
              </button>
            </div>
          )}

          {mode === 'practice' && finished && (
            <div className={styles.practiceEnd}>
              <span>{view.outcome === 'win' ? 'You won this practice battle.' : 'You lost this practice battle.'}</span>
              <button type="button" className={styles.secondaryButton} onClick={startPractice}>
                Try again
              </button>
            </div>
          )}

          {reveal && (mode === 'live' ? finished : true) && (
            <section className={styles.answer}>
              <span className={styles.sectionLabel}>The answer</span>
              <ol className={styles.answerLine}>
                {reveal.solution.map((m, i) => (
                  <li key={i} className={styles.answerStep}>
                    <span className={styles.answerTurn}>Turn {i + 1}</span>
                    <span className={styles.answerMove}>{choiceLabel(m)}</span>
                  </li>
                ))}
              </ol>
              {reveal.explanation && (
                <div className={styles.explanation}>
                  {reveal.explanation.split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
              <div className={styles.answerButtons}>
                <button type="button" className={styles.primaryButton} onClick={watchAnswer} disabled={animating && mode === 'replay'}>
                  Watch the answer
                </button>
                <button type="button" className={styles.secondaryButton} onClick={startPractice}>
                  Practice this puzzle
                </button>
                <Link href="/battle" className={styles.secondaryButton}>
                  More battle puzzles
                </Link>
              </div>
              <p className={styles.srOnly}>Answer: {lineText(reveal.solution)}</p>
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <SetCard title="Your Pokémon" set={puzzle.player} showTera={puzzle.allowTera} />
          <SetCard title="Opponent" set={puzzle.opponent} showTera={false}>
            <div className={styles.aiBox}>
              <span className={styles.sectionLabel}>How this trainer battles</span>
              {puzzle.opponentStyle.mode === 'ai' ? (
                puzzle.opponentStyle.flags.length > 0 ? (
                  <ul className={styles.aiList}>
                    {puzzle.opponentStyle.flags.map((f) => (
                      <li key={f.label}>
                        <strong>{f.label}.</strong> {f.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.aiText}>Picks its moves at random.</p>
                )
              ) : (
                <p className={styles.aiText}>Follows a set battle plan.</p>
              )}
            </div>
          </SetCard>
        </aside>
      </div>
    </div>
  )
}