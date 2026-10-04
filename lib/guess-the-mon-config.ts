// =============================================================================
//  GUESS THE POKÉMON: TUNABLE SETTINGS
//
//  Change hint costs, the wrong-guess penalty, and the ball tiers here.
//  The server uses these numbers to score every player, and the page reads
//  them for its labels, so editing this one file updates both.
// =============================================================================

// ---- Hint costs -------------------------------------------------------------
// Each hint can be revealed once. Its cost is added to the player's points.
// Order here is the order the hint tiles appear on the page.
export const HINTS = [
  { key: 'height', label: 'Height', cost: 1 },
  { key: 'weight', label: 'Weight', cost: 1 },
  { key: 'egg_groups', label: 'Egg groups', cost: 1 },
  { key: 'growth_rate', label: 'Growth rate', cost: 1 },
  { key: 'gender_ratio', label: 'Gender ratio', cost: 1 },
  { key: 'catch_rate', label: 'Catch rate', cost: 2 },
  { key: 'weaknesses', label: 'Weaknesses', cost: 3 },
  { key: 'evolution', label: 'Evolution', cost: 3 },
  { key: 'cry', label: 'Cry', cost: 5 },
] as const

// ---- Wrong-guess penalty ----------------------------------------------------
// Points added for every incorrect guess. Without this, players could guess
// over and over for free and always earn a Master Ball. Set to 0 to disable.
export const WRONG_GUESS_COST = 1

// ---- Ball tiers (fewer points = better ball) ----------------------------------
// A player earns the first tier whose `below` value is greater than their points.
// Keep these sorted from best to worst; the last tier catches everything else.
export const BALL_TIERS = [
  { below: 5, name: 'Master Ball', item: 'master-ball' },
  { below: 10, name: 'Ultra Ball', item: 'ultra-ball' },
  { below: 15, name: 'Great Ball', item: 'great-ball' },
  { below: Infinity, name: 'Poké Ball', item: 'poke-ball' },
] as const

// =============================================================================
//  End of tunable settings. Everything below is shared logic and types.
// =============================================================================

export type HintKey = (typeof HINTS)[number]['key']
export type BallTier = (typeof BALL_TIERS)[number]

// What the server sends back when a hint is revealed.
export type HintValue = { kind: 'lines'; lines: string[] } | { kind: 'audio' }

export function isHintKey(value: unknown): value is HintKey {
  return HINTS.some((h) => h.key === value)
}

export function hintCost(key: HintKey): number {
  return HINTS.find((h) => h.key === key)?.cost ?? 0
}

export function calculatePoints(revealedHints: HintKey[], wrongGuessCount: number): number {
  const hintPoints = revealedHints.reduce((sum, key) => sum + hintCost(key), 0)
  return hintPoints + wrongGuessCount * WRONG_GUESS_COST
}

export function getBallTier(points: number): BallTier {
  return BALL_TIERS.find((tier) => points < tier.below) ?? BALL_TIERS[BALL_TIERS.length - 1]
}

export function ballSpriteUrl(tier: BallTier): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${tier.item}.png`
}