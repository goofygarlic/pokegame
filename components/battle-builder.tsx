'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import SiteHeader from './site-header'
import styles from './battle-builder.module.css'
import { toMoveId } from '@/lib/battle/draft'
import type { CheckResult } from '@/lib/battle/solver'
import {
  AI_FLAGS,
  DEFAULT_AI_FLAGS,
  DIFFICULTIES,
  MAX_PUZZLE_TURNS,
  difficultyLabel,
  randomSeed,
  choiceLabel,
  displaySpecies,
  type AiFlag,
  type BattleDraft,
  type Difficulty,
  type PlayerChoice,
  type SetSummary,
  type ChoiceName,
} from '@/lib/battle/types'

export interface BuilderPuzzleListItem {
  id: string
  title: string
  published: boolean
  difficulty: string
}

interface BattleBuilderProps {
  puzzles: BuilderPuzzleListItem[]
  initialDraft: BattleDraft
  initialId: string | null
  loadError: string | null
}

const SHOWDOWN_PLACEHOLDER = `Pikachu @ Light Ball
Ability: Static
Level: 50
Tera Type: Electric
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Thunderbolt
- Volt Switch
- Grass Knot
- Protect`

// The move's proper name from the "- Move" lines of a Showdown set, e.g. "quickattack" -> "Quick Attack".
function moveNameFromSet(id: string, setText: string): string {
  const line = setText
    .split('\n')
    .map((l) => l.trim().replace(/^-\s*/, ''))
    .find((l) => toMoveId(l) === id)
  return line ?? id
}

// "Endeavor, Tera Quick Attack" <-> [{move:'endeavor'}, {move:'quickattack', tera:true}]
function choicesToText(choices: PlayerChoice[], setText: string, names?: ChoiceName[]): string {
    return choices
    .map((c, i) => choiceLabel({ name: names?.[i]?.name ?? moveNameFromSet(c.move, setText), tera: !!c.tera, mega: !!c.mega }))
    .join(', ')
}

const MEGA_PREFIX = /^mega(?:\s*evolve)?\s*\+\s*/i
const TERA_PREFIX = /^tera(?:stallize)?\s*\+\s*/i

function textToChoices(text: string): PlayerChoice[] {
    return text
    .split(/,|→|->|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
        const mega = MEGA_PREFIX.test(part)
        const tera = TERA_PREFIX.test(part)
        const move = toMoveId(part.replace(MEGA_PREFIX, '').replace(TERA_PREFIX, ''))
        return { move, ...(tera ? { tera: true } : {}), ...(mega ? { mega: true } : {}) }
    })
}

function sameLine(a: PlayerChoice[], b: PlayerChoice[]): boolean {
  return a.length === b.length && a.every((c, i) => c.move === b[i].move && !!c.tera === !!b[i].tera && !!c.mega === !!b[i].mega)
}

// The parts of the draft that change how the battle plays out.
function battleKey(d: BattleDraft): string {
  return JSON.stringify([d.player, d.opponent, d.opponentBehavior, d.maxTurns, d.allowTera, d.seed])
}

function SetPreview({ title, set, showTera }: { title: string; set: SetSummary; showTera: boolean }) {
  return (
    <div className={styles.preview}>
      <span className={styles.label}>{title}</span>
      <div className={styles.previewHead}>
        {set.spriteUrl ? (
          <img className={styles.previewSprite} src={set.spriteUrl} alt="" width={72} height={72} />
        ) : (
          <span className={styles.noSprite}>No sprite</span>
        )}
        <div>
          <div className={styles.previewName}>
            {set.species} <span className={styles.muted}>Lv. {set.level}</span>
          </div>
          <div className={styles.muted}>
            {set.types.join(' / ')} · {set.item ?? 'No item'} · {set.ability ?? 'No ability'} · {set.nature}
            {showTera && set.teraType ? ` · Tera ${set.teraType}` : ''}
          </div>
          {set.transform && (
               <div className={styles.transformLine}>
                 {set.transform.kind === 'mega' ? 'Mega Evolves into' : 'Becomes'} {displaySpecies(set.transform.species)}:{' '}
                 {set.transform.types.join(' / ')} · {set.transform.ability} ·{' '}
                 {Object.entries(set.transform.stats)
                   .map(([stat, value]) => `${stat.toUpperCase()} ${value}`)
                   .join(' ')}
               </div>
             )}
        </div>
      </div>
      <div className={styles.stats}>
        {Object.entries(set.stats).map(([stat, value]) => (
          <span key={stat}>
            <span className={styles.muted}>{stat.toUpperCase()}</span> {value}
          </span>
        ))}
      </div>
      <ul className={styles.previewMoves}>
        {set.moves.map((m) => (
          <li key={m.id}>
            <strong>{m.name}</strong>{' '}
            <span className={styles.muted}>
              {m.type} · {m.category === 'Status' ? 'Status' : `${m.category} ${m.basePower}`}
              {m.priority !== 0 && ` · Priority ${m.priority > 0 ? '+' : ''}${m.priority}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BattleBuilder({ puzzles, initialDraft, initialId, loadError }: BattleBuilderProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<BattleDraft>(initialDraft)
  const [id, setId] = useState<string | null>(initialId)
  const [scriptText, setScriptText] = useState(
    initialDraft.opponentBehavior.mode === 'script' ? initialDraft.opponentBehavior.moves.join('\n') : ''
  )
  const [answerText, setAnswerText] = useState(choicesToText(initialDraft.solution, initialDraft.player))
  const [result, setResult] = useState<CheckResult | null>(null)
  const [checkedKey, setCheckedKey] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(loadError ? { kind: 'error', text: loadError } : null)
  const [showLog, setShowLog] = useState(false)

  const stale = result !== null && checkedKey !== battleKey(draft)
  const behavior = draft.opponentBehavior

  function update(changes: Partial<BattleDraft>) {
    setDraft((d) => ({ ...d, ...changes }))
  }

  function setAnswer(choices: PlayerChoice[], names?: ChoiceName[]) {
    update({ solution: choices })
    setAnswerText(choicesToText(choices, draft.player, names))
  }

  function toggleFlag(flag: AiFlag) {
    if (behavior.mode !== 'ai') return
    const flags = behavior.flags.includes(flag) ? behavior.flags.filter((f) => f !== flag) : [...behavior.flags, flag]
    update({ opponentBehavior: { mode: 'ai', flags } })
  }

  async function runCheck() {
    setChecking(true)
    setMessage(null)
    try {
      const res = await fetch('/api/battle/builder/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      })
      const data = await res.json()
      if (!res.ok) return setMessage({ kind: 'error', text: data.error ?? 'Check failed' })
      const checked: CheckResult = data.result
      setResult(checked)
      setCheckedKey(battleKey(draft))
      // Only one way to win and no answer picked yet: that's the answer.
      if (draft.solution.length === 0 && checked.solutions.length === 1) {
        setAnswer(checked.solutions[0].choices, checked.solutions[0].names)
      }
    } catch {
      setMessage({ kind: 'error', text: 'Check failed. The server may have timed out; try a lower turn limit.' })
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/battle/builder/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, draft }),
      })
      const data = await res.json()
      if (!res.ok) return setMessage({ kind: 'error', text: data.error ?? 'Save failed' })
      setId(data.id)
      setMessage({ kind: 'ok', text: draft.published ? 'Saved and published.' : 'Saved as a draft (not published).' })
      router.replace(`/battle/builder?id=${data.id}`, { scroll: false })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function lock() {
    await fetch('/api/battle/builder/login', { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className={styles.board}>
      <SiteHeader>
        <button type="button" className={styles.linkButton} onClick={lock}>
          Lock builder
        </button>
      </SiteHeader>

      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>{id ? 'Edit battle puzzle' : 'New battle puzzle'}</h1>
        <div className={styles.topActions}>
          <select
            className={styles.select}
            value={id ?? ''}
            onChange={(e) => router.push(e.target.value ? `/battle/builder?id=${e.target.value}` : '/battle/builder')}
            aria-label="Open a puzzle"
          >
            <option value="">+ New puzzle</option>
            {puzzles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({difficultyLabel(p.difficulty)}){p.published ? '' : ' [draft]'}
              </option>
            ))}
          </select>
          <Link href="/battle" className={styles.secondaryButton}>
            View puzzle list
          </Link>
        </div>
      </div>

      <div className={styles.layout}>
        {/* ---------------- left: the form ---------------- */}
        <div className={styles.form}>
          <section className={styles.section}>
            <span className={styles.sectionTitle}>1. The puzzle</span>
            <label className={styles.field}>
              <span className={styles.label}>Title</span>
              <input className={styles.input} value={draft.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Briefing (shown above the battle)</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
            <div className={styles.row}>
              <div className={styles.field}>
                <span className={styles.label}>Difficulty</span>
                <div className={styles.segmented} role="radiogroup" aria-label="Difficulty">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={draft.difficulty === d.id}
                      className={`${styles.segment} ${draft.difficulty === d.id ? styles.segmentOn : ''}`}
                      data-difficulty={d.id}
                      onClick={() => update({ difficulty: d.id as Difficulty })}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Turn limit</span>
                <input
                  className={`${styles.input} ${styles.small}`}
                  type="number"
                  min={1}
                  max={MAX_PUZZLE_TURNS}
                  value={draft.maxTurns}
                  onChange={(e) => update({ maxTurns: Number(e.target.value) })}
                />
              </label>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={draft.allowTera} onChange={(e) => update({ allowTera: e.target.checked })} />
                Allow Terastallization
              </label>
            </div>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionTitle}>2. The Pokémon</span>
            <p className={styles.hint}>
              Paste each Pokémon in Showdown&apos;s export format (Teambuilder → Import/Export). Missing lines use
              defaults: level 100, the species&apos; first ability, a neutral nature, 0 EVs, 31 IVs.
            </p>
            <div className={styles.twoCol}>
              <label className={styles.field}>
                <span className={styles.label}>Your Pokémon</span>
                <textarea
                  className={`${styles.textarea} ${styles.code}`}
                  rows={9}
                  spellCheck={false}
                  placeholder={SHOWDOWN_PLACEHOLDER}
                  value={draft.player}
                  onChange={(e) => update({ player: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Opponent</span>
                <textarea
                  className={`${styles.textarea} ${styles.code}`}
                  rows={9}
                  spellCheck={false}
                  placeholder={SHOWDOWN_PLACEHOLDER}
                  value={draft.opponent}
                  onChange={(e) => update({ opponent: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionTitle}>3. How the opponent battles</span>
            <div className={styles.segmented} role="radiogroup" aria-label="Opponent behavior">
              <button
                type="button"
                role="radio"
                aria-checked={behavior.mode === 'ai'}
                className={`${styles.segment} ${behavior.mode === 'ai' ? styles.segmentOn : ''}`}
                onClick={() => update({ opponentBehavior: { mode: 'ai', flags: behavior.mode === 'ai' ? behavior.flags : DEFAULT_AI_FLAGS } })}
              >
                Trainer AI
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={behavior.mode === 'script'}
                className={`${styles.segment} ${behavior.mode === 'script' ? styles.segmentOn : ''}`}
                onClick={() => update({ opponentBehavior: { mode: 'script', moves: scriptText.split('\n').map((m) => m.trim()).filter(Boolean) } })}
              >
                Scripted moves
              </button>
            </div>

            {behavior.mode === 'ai' ? (
              <div className={styles.flags}>
                {(Object.keys(AI_FLAGS) as AiFlag[]).map((flag) => (
                  <label key={flag} className={styles.flag}>
                    <input type="checkbox" checked={behavior.flags.includes(flag)} onChange={() => toggleFlag(flag)} />
                    <span>
                      <strong>{AI_FLAGS[flag].label}</strong> <code className={styles.gameFlag}>{AI_FLAGS[flag].gameFlag}</code>
                      <span className={styles.flagText}>{AI_FLAGS[flag].description}</span>
                    </span>
                  </label>
                ))}
                <p className={styles.hint}>With no flags ticked, the opponent picks a move at random (fixed by the seed).</p>
              </div>
            ) : (
              <label className={styles.field}>
                <span className={styles.label}>One move per turn (the last one repeats)</span>
                <textarea
                  className={`${styles.textarea} ${styles.code}`}
                  rows={4}
                  spellCheck={false}
                  placeholder={'Psystrike\nPsystrike'}
                  value={scriptText}
                  onChange={(e) => {
                    setScriptText(e.target.value)
                    update({ opponentBehavior: { mode: 'script', moves: e.target.value.split('\n').map((m) => m.trim()).filter(Boolean) } })
                  }}
                />
              </label>
            )}

            <div className={styles.seedRow}>
              <span className={styles.label}>Seed</span>
              <code className={styles.seed}>{draft.seed}</code>
              <button type="button" className={styles.linkButton} onClick={() => update({ seed: randomSeed() })}>
                New seed
              </button>
            </div>
            <p className={styles.hint}>The seed fixes damage rolls, crits and misses, so the puzzle plays the same way every time.</p>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionTitle}>4. Answer and explanation</span>
            <label className={styles.field}>
              <span className={styles.label}>Answer (pick a winning line from the check, or type moves separated by commas)</span>
              <input
                className={styles.input}
                placeholder="Endeavor, Quick Attack   (or “Mega Evolve + Dragon Claw”, “Tera + Hyper Fang”)"
                value={answerText}
                onChange={(e) => {
                  setAnswerText(e.target.value)
                  update({ solution: textToChoices(e.target.value) })
                }}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Why it works (shown after the puzzle ends; leave a blank line between paragraphs)</span>
              <textarea
                className={styles.textarea}
                rows={5}
                value={draft.explanation}
                onChange={(e) => update({ explanation: e.target.value })}
              />
            </label>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={draft.published} onChange={(e) => update({ published: e.target.checked })} />
              Published (visible on the battle puzzle list)
            </label>
          </section>

          <div className={styles.buttons}>
            <button type="button" className={styles.primaryButton} onClick={runCheck} disabled={checking}>
              {checking ? 'Checking every line…' : 'Check puzzle'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : id ? 'Save changes' : 'Save puzzle'}
            </button>
            {id && (
              <Link href={`/play/${id}`} className={styles.linkButton} target="_blank">
                Open puzzle ↗
              </Link>
            )}
          </div>
          {message && <p className={message.kind === 'error' ? styles.errorText : styles.okText}>{message.text}</p>}
        </div>

        {/* ---------------- right: check results ---------------- */}
        <aside className={styles.results}>
          {!result ? (
            <div className={styles.emptyResults}>
              <span className={styles.sectionTitle}>Check results</span>
              <p className={styles.hint}>
                Press <strong>Check puzzle</strong> to see both Pokémon, every winning line within the turn limit, and
                whether each one depends on luck.
              </p>
            </div>
          ) : (
            <>
              {stale && <p className={styles.staleNote}>You changed the battle since this check. Check again.</p>}

              {result.errors.length > 0 && (
                <ul className={styles.errorList}>
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {result.warnings.length > 0 && (
                <ul className={styles.warningList}>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {result.errors.length === 0 && result.warnings.length === 0 && (
                <p className={styles.okBanner}>Looks good: exactly one winning line, and it doesn&apos;t rely on luck.</p>
              )}

              {result.player && result.opponent && (
                <div className={styles.previews}>
                  <SetPreview title="Your Pokémon" set={result.player} showTera={draft.allowTera} />
                  <SetPreview title="Opponent" set={result.opponent} showTera={false} />
                </div>
              )}

              {result.firstTurnAi.length > 0 && (
                <div className={styles.block}>
                  <span className={styles.sectionTitle}>Opponent&apos;s scores on turn 1</span>
                  <ul className={styles.scores}>
                    {result.firstTurnAi.map((s) => {
                      const top = Math.max(...result.firstTurnAi.map((x) => x.score))
                      return (
                        <li key={s.move} className={s.score === top ? styles.scoreTop : ''}>
                          <span>{s.move}</span>
                          <span className={styles.scoreValue}>{s.score}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <p className={styles.hint}>Highest score is used; ties are broken by the seed.</p>
                </div>
              )}

              {result.player && (
                <div className={styles.block}>
                  <span className={styles.sectionTitle}>
                    Winning lines ({result.solutions.length}
                    {result.complete ? '' : '+'}) · {result.battlesRun} battles simulated
                  </span>
                  {result.solutions.length === 0 ? (
                    <p className={styles.hint}>No line wins within the turn limit.</p>
                  ) : (
                    <ul className={styles.lines}>
                      {result.solutions.map((line, i) => {
                        const chosen = sameLine(line.choices, draft.solution)
                        const lucky = line.seedWins < line.seedsTried
                        return (
                          <li key={i} className={`${styles.line} ${chosen ? styles.lineChosen : ''}`}>
                            <span className={styles.lineMoves}>
                              {line.names.map((n, j) => (
                                <span key={j} className={styles.lineMove}>
                                  {n.tera ? `Tera ${n.name}` : n.name}
                                </span>
                              ))}
                            </span>
                            <span className={lucky ? styles.luckBad : styles.luckGood}>
                              Wins {line.seedWins}/{line.seedsTried} seeds
                            </span>
                            {chosen ? (
                              <span className={styles.chosen}>Answer ✓</span>
                            ) : (
                              <button type="button" className={styles.linkButton} onClick={() => setAnswer(line.choices, line.names)}>
                                Use as answer
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

              {result.intended && (
                <div className={styles.block}>
                  <span className={styles.sectionTitle}>Your answer played out</span>
                  <p className={result.intended.wins ? styles.okText : styles.errorText}>
                    {result.intended.wins
                      ? `Wins in ${result.intended.turns} turn${result.intended.turns === 1 ? '' : 's'} (${result.intended.seedWins}/${result.intended.seedsTried} seeds).`
                      : 'Does not win with this seed.'}
                  </p>
                  <button type="button" className={styles.linkButton} onClick={() => setShowLog((s) => !s)}>
                    {showLog ? 'Hide battle log' : 'Show battle log'}
                  </button>
                  {showLog && (
                    <ol className={styles.log}>
                      {result.intended.view.events
                        .filter((e) => e.text)
                        .map((e, i) => (
                          <li key={i} className={e.kind === 'turn' ? styles.logTurn : e.kind === 'move' ? styles.logMove : ''}>
                            {e.text}
                          </li>
                        ))}
                    </ol>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}