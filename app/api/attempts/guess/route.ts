import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHintData, type HintData } from '@/lib/pokeapi'
 
type ExactOrDirection = 'correct' | 'higher' | 'lower'
type TypeComparison = 'correct' | 'present' | 'absent'
 
interface GuessComparison {
  type1: TypeComparison
  type2: TypeComparison
  generation: ExactOrDirection
  height: ExactOrDirection
  weight: ExactOrDirection
  color: 'correct' | 'absent'
}
 
const GENERATION_ORDER = [
  'generation-i', 'generation-ii', 'generation-iii', 'generation-iv',
  'generation-v', 'generation-vi', 'generation-vii', 'generation-viii',
  'generation-ix',
]
 
function compareType(guessType: string | undefined, answerTypes: string[], slot: 0 | 1): TypeComparison {
  if (!guessType && !answerTypes[slot]) return 'correct' // both typeless in this slot
  if (!guessType || !answerTypes[slot]) return 'absent'
  if (guessType === answerTypes[slot]) return 'correct'
  if (answerTypes.includes(guessType)) return 'present' // right type, wrong slot
  return 'absent'
}
 
function compareOrdinal(guessValue: number, answerValue: number): ExactOrDirection {
  if (guessValue === answerValue) return 'correct'
  return guessValue < answerValue ? 'higher' : 'lower' // direction the ANSWER is relative to guess
}
 
function compareGeneration(guessGen: string, answerGen: string): ExactOrDirection {
  if (guessGen === answerGen) return 'correct'
  const guessIdx = GENERATION_ORDER.indexOf(guessGen)
  const answerIdx = GENERATION_ORDER.indexOf(answerGen)
  if (guessIdx === -1 || answerIdx === -1) return 'correct' // unknown gen, don't guess direction
  return guessIdx < answerIdx ? 'higher' : 'lower'
}
 
function buildComparison(guess: HintData, answer: HintData): GuessComparison {
  return {
    type1: compareType(guess.types[0], answer.types, 0),
    type2: compareType(guess.types[1], answer.types, 1),
    generation: compareGeneration(guess.generation, answer.generation),
    height: compareOrdinal(guess.height, answer.height),
    weight: compareOrdinal(guess.weight, answer.weight),
    color: guess.color === answer.color ? 'correct' : 'absent',
  }
}
 
interface GuessAttributes {
  type1: string
  type2: string | null
  generation: string
  height: number
  weight: number
  color: string
}
 
function extractAttributes(pokemon: HintData): GuessAttributes {
  return {
    type1: pokemon.types[0],
    type2: pokemon.types[1] ?? null,
    generation: pokemon.generation,
    height: pokemon.height,
    weight: pokemon.weight,
    color: pokemon.color,
  }
}
 
function toSlug(rawName: string): string {
  return rawName.trim().toLowerCase().replace(/\s+/g, '-')
}
 
export async function POST(request: Request) {
  const supabase = await createClient()
 
  const {
    data: { user },
  } = await supabase.auth.getUser()
 
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
 
  const { puzzleId, guess } = await request.json()
 
  if (!puzzleId || typeof guess !== 'string' || guess.trim().length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
 
  const { data: puzzle, error: puzzleError } = await supabase
    .from('puzzles')
    .select('id, type, content')
    .eq('id', puzzleId)
    .single()
 
  if (puzzleError || !puzzle || puzzle.type !== 'pokedle') {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }
 
  const answerSlug: string = puzzle.content.answer_species
  const guessSlug = toSlug(guess)
 
  const { data: existingAttempt } = await supabase
    .from('attempts')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', user.id)
    .maybeSingle()
 
  if (existingAttempt?.completed) {
    return NextResponse.json(
      { error: 'Puzzle already completed', completed: true },
      { status: 400 }
    )
  }
 
  let guessData: HintData
  let answerData: HintData
 
  try {
    ;[guessData, answerData] = await Promise.all([
      getHintData(guessSlug, supabase),
      getHintData(answerSlug, supabase),
    ])
  } catch {
    return NextResponse.json(
      { error: `"${guess}" isn't a recognized Pokemon name` },
      { status: 400 }
    )
  }
 
  const succeeded = guessData.name === answerData.name
  const comparison = buildComparison(guessData, answerData)
  const attributes = extractAttributes(guessData)
 
  const priorGuesses = existingAttempt?.guesses ?? []
  const newGuesses = [
    ...priorGuesses,
    {
      guess: guessData.name,
      sprite_url: guessData.spriteUrl,
      attributes,
      comparison,
      guessed_at: new Date().toISOString(),
    },
  ]
 
  const attemptPayload = {
    puzzle_id: puzzleId,
    user_id: user.id,
    guesses: newGuesses,
    completed: succeeded,
    succeeded: succeeded ? true : null,
    completed_at: succeeded ? new Date().toISOString() : null,
  }
 
  const { error: upsertError } = await supabase
    .from('attempts')
    .upsert(attemptPayload, { onConflict: 'puzzle_id,user_id' })
 
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }
 
  return NextResponse.json({
    guessName: guessData.name,
    spriteUrl: guessData.spriteUrl,
    attributes,
    comparison,
    completed: succeeded,
    succeeded,
    guessesUsed: newGuesses.length,
    answer: succeeded ? answerData.name : undefined,
  })
}