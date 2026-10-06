//  TUNABLE: FORM SETTINGS
//  Which alternate forms can be a daily answer and appear in the guess dropdowns.
//  The dropdown list rebuilds itself after a change (its cache key includes these flags). Puzzles that already exist keep their answer; new ones follow the rules.
export const FORM_RULES = {
  regional: true, // Alolan, Galarian, Hisuian, Paldean forms
  megaPrimal: true, // Mega Evolutions and Primal Reversions
  otherAlternate: true, // Zen Mode Darmanitan, Rotom appliances, Deoxys formes, etc.
  gigantamax: false, // Gigantamax forms and Eternamax Eternatus
  totem: false, // Totem Pokémon from Sun/Moon
  cosmetic: false, // Pikachu in caps/costumes, Let's Go Pikachu/Eevee
}

// Individual forms to always leave out, whatever FORM_RULES says. Koraidon's builds and
// Miraidon's modes are riding forms that are the same in battle, and half have no sprite.
export const EXCLUDED_FORMS = new Set([
  'koraidon-limited-build', 'koraidon-sprinting-build', 'koraidon-swimming-build', 'koraidon-gliding-build',
  'miraidon-low-power-mode', 'miraidon-drive-mode', 'miraidon-aquatic-mode', 'miraidon-glide-mode',
])

// Names that the automatic labels don't get right. Keys are PokeAPI form names.
// The automatic rules already give "galarian darmanitan", "mega charizard x", "primal kyogre", "paldean tauros (combat breed)" and "rotom (wash)".
export const LABEL_OVERRIDES: Record<string, string> = {
  'darmanitan-zen': 'darmanitan zen mode',
  'darmanitan-galar-zen': 'galarian darmanitan zen mode',
}

// true:  any form of the answer's species is correct (Darmanitan solves Galarian Darmanitan).
// false: the player has to pick the exact form.
export const MATCH_ANY_FORM = true

export type FormCategory = keyof typeof FORM_RULES

export interface GuessOption {
  value: string // what gets sent to the server: a species name ("darmanitan") or form name ("darmanitan-galar-standard")
  label: string // what the player sees: "galarian darmanitan"
  species: string // the species it belongs to: "darmanitan"
}

// What the result card shows once a puzzle is solved.
export interface AnswerReveal {
  name: string // the label, so the card names the exact form
  dexNumber: number // National Dex number of the species
  spriteUrl: string | null
}

// Sorts a non-default form into one of the FORM_RULES groups. Only the name is needed, which is what lets the dropdown list be built from one PokeAPI call.
export function classifyForm(name: string, species: string): FormCategory {
  if (/-(gmax|eternamax)$/.test(name)) return 'gigantamax'
  if (/-totem(-|$)/.test(name)) return 'totem'
  if (species === 'pikachu' || /-starter$/.test(name)) return 'cosmetic'
  if (/-(mega|primal)(-|$)/.test(name)) return 'megaPrimal'
  if (/-(alola|galar|hisui|paldea)(-|$)/.test(name)) return 'regional'
  return 'otherAlternate'
}

// Default forms (plain Darmanitan, Disguised Mimikyu, ...) are always allowed.
export function isAllowedForm(name: string, species: string, isDefault: boolean): boolean {
  if (isDefault) return true
  return !EXCLUDED_FORMS.has(name) && FORM_RULES[classifyForm(name, species)]
}

const REGION_WORDS: Record<string, string> = {
  alola: 'alolan',
  galar: 'galarian',
  hisui: 'hisuian',
  paldea: 'paldean',
}

// Labels follow how the games name forms:
//   "darmanitan-galar-standard"  -> "galarian darmanitan"
//   "charizard-mega-x"           -> "mega charizard x"
//   "kyogre-primal"              -> "primal kyogre"
//   "tauros-paldea-combat-breed" -> "paldean tauros (combat breed)"
//   "rotom-wash"                 -> "rotom (wash)"
// Default forms show just the species ("mimikyu", not "mimikyu-disguised").
// Labels stay lowercase like the species names; CSS capitalizes them on screen.
export function formLabel(name: string, species: string, isDefault: boolean): string {
  if (isDefault || name === species) return species
  if (LABEL_OVERRIDES[name]) return LABEL_OVERRIDES[name]
  if (!name.startsWith(`${species}-`)) return name.replace(/-/g, ' ')

  let words = name.slice(species.length + 1).split('-')
  const prefix: string[] = []
  let suffix = ''

  // Regional forms lead with the region: "galarian darmanitan". "standard" is the regular mode, so it's dropped ("galarian darmanitan", not "... (standard)").
  const region = words.find((w) => REGION_WORDS[w])
  if (region) {
    prefix.push(REGION_WORDS[region])
    words = words.filter((w) => w !== region && w !== 'standard')
  }

  // Megas and Primals lead with that word, and X / Y / Z go at the end: "mega charizard x".
  const special = words.find((w) => w === 'mega' || w === 'primal')
  if (special) {
    prefix.push(special)
    words = words.filter((w) => w !== special)
    if (words.length === 1 && /^[xyz]$/.test(words[0])) {
      suffix = ` ${words[0]}`
      words = []
    }
  }

  const base = `${[...prefix, species].join(' ')}${suffix}`
  return words.length > 0 ? `${base} (${words.join(' ')})` : base
}

// The species a form belongs to, worked out from its name: the longest species name that the form name starts with ("mr-mime-galar" -> "mr-mime", not "mr").
export function speciesForForm(name: string, speciesNames: Set<string>): string | null {
  const parts = name.split('-')
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('-')
    if (speciesNames.has(candidate)) return candidate
  }
  return null
}

// Every species, plus the alternate forms FORM_RULES allows. PokeAPI numbers default forms 1-1025 (same as the National Dex) and alternate forms 10001+.
export function buildGuessOptions(pokemon: { name: string; id: number }[], speciesNames: string[]): GuessOption[] {
  const speciesSet = new Set(speciesNames)
  const options: GuessOption[] = speciesNames.map((s) => ({ value: s, label: s, species: s }))

  for (const p of pokemon) {
    if (p.id <= 10000) continue
    const species = speciesForForm(p.name, speciesSet)
    if (!species || !isAllowedForm(p.name, species, false)) continue
    options.push({ value: p.name, label: formLabel(p.name, species, false), species })
  }

  // Group by species, plain form first, so "galarian darmanitan" sits next to "darmanitan".
  const isDefault = (o: GuessOption) => (o.value === o.species ? 0 : 1)
  return options.sort(
    (a, b) =>
      compareText(a.species, b.species) || isDefault(a) - isDefault(b) || compareText(a.label, b.label)
  )
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Part of the dropdown cache key, so changing FORM_RULES, EXCLUDED_FORMS or LABEL_OVERRIDES (or the label rules, via LABEL_VERSION) rebuilds the list.
const LABEL_VERSION = 2
export function formRulesKey(): string {
  const rules = Object.entries(FORM_RULES)
    .map(([key, on]) => `${key[0]}${on ? 1 : 0}`)
    .join('')
  // Short checksum of the excluded names and label overrides, so editing them also changes the key.
  const text = [...EXCLUDED_FORMS].sort().join(',') + JSON.stringify(LABEL_OVERRIDES)
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return `${rules}.${(hash >>> 0).toString(36)}.l${LABEL_VERSION}`
}

// Dropdown search. Every word typed has to appear in the label, so "mega charizard", "galarian darmanitan" and "mr mime" all work.
export function filterGuessOptions(options: GuessOption[], query: string, limit = 8): GuessOption[] {
  const words = query.toLowerCase().split(/[\s-]+/).filter(Boolean)
  if (words.length === 0) return []
  return options.filter((o) => words.every((w) => o.label.includes(w))).slice(0, limit)
}

// Matches what's in the search box (a label, or a raw value) to an option.
export function findGuessOption(options: GuessOption[], text: string): GuessOption | undefined {
  const t = text.trim().toLowerCase()
  if (t.length === 0) return undefined
  return options.find((o) => o.label === t) ?? options.find((o) => o.value === t.replace(/\s+/g, '-'))
}