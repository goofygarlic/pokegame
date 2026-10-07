import SiteHeader from '@/components/site-header'
import BattleBuilder, { type BuilderPuzzleListItem } from '@/components/battle-builder'
import BuilderLogin from '@/components/builder-login'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBuilder } from '@/lib/battle/builder-auth'
import { TEMPLATE_DRAFT } from '@/lib/battle/draft'
import { BATTLE_TYPE, isBattleContent, loadBattlePuzzle } from '@/lib/battle/puzzles'
import type { BattleDraft } from '@/lib/battle/types'

// The battle puzzle builder. Only works in browsers that entered BATTLE_BUILDER_SECRET. /battle/builder starts a new puzzle; /battle/builder?id=<puzzle id> edits one.
export default async function BattleBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  if (!(await isBuilder())) {
    return (
      <main style={{ padding: '2rem' }}>
        <div style={{ maxWidth: 1100, marginInline: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SiteHeader />
          <BuilderLogin />
        </div>
      </main>
    )
  }

  const { id } = await searchParams
  let puzzles: BuilderPuzzleListItem[] = []
  let draft: BattleDraft = TEMPLATE_DRAFT
  let editingId: string | null = null
  let loadError: string | null = null

  try {
    // The builder reads unpublished puzzles too, so it uses the admin (secret key) client.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('puzzles')
      .select('id, title, published, content')
      .eq('type', BATTLE_TYPE)
    if (error) throw new Error(error.message)

    puzzles = (data ?? [])
      .filter((p) => isBattleContent(p.content))
      .sort((a, b) => String(b.content.createdAt).localeCompare(String(a.content.createdAt)))
      .map((p) => ({ id: p.id, title: p.title, published: p.published, difficulty: p.content.difficulty }))

    if (id) {
      const puzzle = await loadBattlePuzzle(admin, id, true)
      if (puzzle) {
        const c = puzzle.content
        editingId = puzzle.id
        draft = {
          title: puzzle.title,
          description: puzzle.description ?? '',
          difficulty: c.difficulty,
          player: c.player,
          opponent: c.opponent,
          opponentBehavior: c.opponentBehavior,
          maxTurns: c.maxTurns,
          allowTera: c.allowTera,
          seed: c.seed,
          solution: c.solution,
          explanation: c.explanation,
          published: puzzle.published,
        }
      } else {
        loadError = "Couldn't find that puzzle, so a new one was started."
      }
    }
  } catch (err) {
    loadError = `Couldn't load your puzzles (${err instanceof Error ? err.message : String(err)}). Check SUPABASE_SECRET_KEY is set.`
  }

  return (
    <main style={{ padding: '2rem' }}>
      <BattleBuilder key={editingId ?? 'new'} puzzles={puzzles} initialDraft={draft} initialId={editingId} loadError={loadError} />
    </main>
  )
}