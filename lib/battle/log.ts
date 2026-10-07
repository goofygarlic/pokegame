// Turns the simulator's battle log (Showdown's "protocol" lines) into short, game-style sentences for the battle screen.
// Lines it doesn't know are skipped, so an unusual effect never breaks the screen; it just won't get its own sentence. Add a case below to give it one.

import { Dex } from '@pkmn/sim'
import { displaySpecies, type BattleEvent } from './types'

type Side = 'player' | 'opponent'

const STATUS_START: Record<string, string> = {
  par: 'is paralyzed! It may be unable to move!',
  brn: 'was burned!',
  psn: 'was poisoned!',
  tox: 'was badly poisoned!',
  slp: 'fell asleep!',
  frz: 'was frozen solid!',
}

const STATUS_NAMES: Record<string, string> = {
  par: 'paralysis',
  brn: 'burn',
  psn: 'poison',
  tox: 'poison',
  slp: 'sleep',
  frz: 'freeze',
}

const CANT_REASONS: Record<string, string> = {
  par: "couldn't move because it's paralyzed!",
  slp: 'is fast asleep.',
  frz: 'is frozen solid!',
  recharge: 'must recharge!',
  flinch: 'flinched and couldn\'t move!',
}

const STAT_NAMES: Record<string, string> = {
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
  accuracy: 'accuracy',
  evasion: 'evasiveness',
}

const WEATHER_START: Record<string, string> = {
  sunnyday: 'The sunlight turned harsh!',
  raindance: 'It started to rain!',
  sandstorm: 'A sandstorm kicked up!',
  snowscape: 'It started to snow!',
  desolateland: 'The sunlight turned extremely harsh!',
  primordialsea: 'A heavy rain began to fall!',
  deltastream: 'Mysterious strong winds are protecting Flying-type Pokémon!',
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function sideOf(ident: string): Side {
  return ident.startsWith('p1') ? 'player' : 'opponent'
}

// "p2a: Mewtwo" -> "the opposing Mewtwo"; "p1a: Rattata" -> "Rattata"
function monName(ident: string | undefined): string {
  if (!ident) return 'the Pokémon'
  const name = ident.replace(/^p\d[a-z]?:\s*/, '')
  return sideOf(ident) === 'opponent' ? `the opposing ${name}` : name
}

// "[from] item: Life Orb" -> "Life Orb"
function effectName(value: string | undefined): string {
  if (!value) return ''
  return value.replace(/^\[from\]\s*/, '').replace(/^(item|ability|move):\s*/, '')
}

function kwarg(args: string[], key: string): string | undefined {
  return args.find((a) => a.startsWith(`[${key}]`))?.slice(key.length + 2).trim()
}

function parseHp(value: string | undefined): { hp: number; maxhp: number | null } | null {
  if (!value) return null
  const [hpPart] = value.split(' ')
  if (hpPart === '0') return { hp: 0, maxhp: null }
  const match = /^(\d+)\/(\d+)/.exec(hpPart)
  return match ? { hp: Number(match[1]), maxhp: Number(match[2]) } : null
}

export function formatBattleLog(lines: string[]): BattleEvent[] {
  const events: BattleEvent[] = []
  const maxhp: Record<Side, number> = { player: 0, opponent: 0 }
  const forme: Record<Side, string> = { player: '', opponent: '' } // latest form, used to name a Mega Evolution
  const fainted: Record<Side, boolean> = { player: false, opponent: false }
  let turn = 0

  const push = (kind: BattleEvent['kind'], text: string, hp?: BattleEvent['hp']) =>
    events.push({ turn, kind, text: capitalize(text), ...(hp ? { hp } : {}) })

  const hpEvent = (ident: string, value: string | undefined): BattleEvent['hp'] | undefined => {
    const parsed = parseHp(value)
    if (!parsed) return undefined
    const side = sideOf(ident)
    if (parsed.maxhp) maxhp[side] = parsed.maxhp
    return { side, hp: parsed.hp, maxhp: parsed.maxhp ?? maxhp[side] }
  }

  for (const line of lines) {
    if (!line.startsWith('|')) continue
    const [, cmd, ...args] = line.split('|')
    const who = args[0]
    const from = kwarg(args, 'from')

    switch (cmd) {
      case 'turn':
        turn = Number(args[0]) || turn + 1
        push('turn', `Turn ${turn}`)
        break

        case 'switch':
         case 'drag': {
           const hp = hpEvent(who, args[2])
           const species = args[1]?.split(',')[0] ?? ''
           forme[sideOf(who)] = species
           push('info', sideOf(who) === 'player' ? `Go! ${species}!` : `Your opponent sent out ${species}!`, hp)
           events[events.length - 1].forme = { side: sideOf(who), species }
           break
         }

         // The Pokémon changed form: Mega Evolution, Primal Reversion, Zen Mode, Stance Change, ...
         case 'detailschange':
         case '-formechange': {
           const species = args[1]?.split(',')[0] ?? ''
           if (fainted[sideOf(who)]) break // a fainted Mega switching back to normal isn't worth showing
           forme[sideOf(who)] = species
           events.push({ turn, kind: 'info', text: '', forme: { side: sideOf(who), species } })
           if (cmd === '-formechange' && from) push('info', `${monName(who)} changed form!`)
           break
         }

         case '-mega': {
           const name = monName(who)
           push('info', `${name}'s ${args[2] || 'Mega Stone'} is reacting!`)
           push('info', `${name} has Mega Evolved into ${displaySpecies(forme[sideOf(who)] || `${args[1]}-Mega`)}!`)
           break
         }

         case '-primal':
           push('info', `${monName(who)}'s Primal Reversion! It reverted to its primal form!`)
           break

      case 'move': {
        const missed = args.includes('[miss]')
        push('move', `${monName(who)} used ${args[1]}!`)
        if (missed && args[2]) push('info', `${monName(args[2])} avoided the attack!`)
        break
      }

      case '-damage': {
        const hp = hpEvent(who, args[1])
        const source = effectName(from)
        if (!from) {
          if (hp) events.push({ turn, kind: 'info', text: '', hp }) // silent HP change from an attack
        } else if (source === 'psn' || source === 'tox') {
          push('info', `${monName(who)} was hurt by poison!`, hp)
        } else if (source === 'brn') {
          push('info', `${monName(who)} was hurt by its burn!`, hp)
        } else if (source === 'Recoil') {
          push('info', `${monName(who)} was damaged by the recoil!`, hp)
        } else if (source === 'sandstorm') {
          push('info', `${monName(who)} is buffeted by the sandstorm!`, hp)
        } else if (source === 'confusion') {
          push('info', 'It hurt itself in its confusion!', hp)
        } else {
          const owner = kwarg(args, 'of')
          const whose = owner && owner !== who ? `${monName(owner)}'s ` : ''
          push('info', `${monName(who)} was hurt by ${whose}${source}!`, hp)
        }
        break
      }

      case '-heal': {
        const hp = hpEvent(who, args[1])
        const source = effectName(from)
        if (source === 'Leftovers') push('info', `${monName(who)} restored a little HP using its Leftovers!`, hp)
        else if (source === 'drain') push('info', `${monName(kwarg(args, 'of'))} had its energy drained!`, hp)
        else push('info', `${monName(who)} had its HP restored.`, hp)
        break
      }

      case '-sethp': {
        const hp = hpEvent(who, args[1])
        if (hp) events.push({ turn, kind: 'info', text: '', hp })
        break
      }

      case 'faint':
        fainted[sideOf(who)] = true
        push('info', `${monName(who)} fainted!`)
        break

      case '-crit':
        push('info', 'A critical hit!')
        break
      case '-supereffective':
        push('info', "It's super effective!")
        break
      case '-resisted':
        push('info', "It's not very effective...")
        break
      case '-immune':
        push('info', `It doesn't affect ${monName(who)}...`)
        break
      case '-miss':
        push('info', `${monName(args[1] || who)} avoided the attack!`)
        break
      case '-fail':
        push('info', 'But it failed!')
        break
      case '-ohko':
        push('info', "It's a one-hit KO!")
        break
      case '-hitcount':
        push('info', `The Pokémon was hit ${args[1]} times!`)
        break

      case '-enditem': {
        const item = args[1]
        if (args.includes('[eat]')) push('info', `${monName(who)} ate its ${item}!`)
        else if (item === 'Focus Sash' || item === 'Focus Band') push('info', `${monName(who)} hung on using its ${item}!`)
        else if (from) push('info', `${monName(who)}'s ${item} was ${effectName(from) === 'Knock Off' ? 'knocked off' : 'removed'}!`)
        else push('info', `${monName(who)}'s ${item} was used up.`)
        break
      }

      case '-item':
        if (from) push('info', `${monName(who)} obtained a ${args[1]}!`)
        break

      case '-activate': {
        const effect = effectName(args[1])
        if (effect === 'Endure' || effect === 'Sturdy') push('info', `${monName(who)} endured the hit!`)
        else if (effect === 'Protect' || effect === 'Detect') push('info', `${monName(who)} protected itself!`)
        else if (effect === 'confusion') push('info', `${monName(who)} is confused!`)
        break
      }

      case '-singleturn': {
        const effect = effectName(args[1])
        if (effect === 'Protect' || effect === 'Detect') push('info', `${monName(who)} protected itself!`)
        else if (effect === 'Endure') push('info', `${monName(who)} braced itself!`)
        break
      }

      case '-status':
        push('info', `${monName(who)} ${STATUS_START[args[1]] ?? `was afflicted with ${args[1]}!`}`)
        break
      case '-curestatus':
        push('info', `${monName(who)} was cured of its ${STATUS_NAMES[args[1]] ?? args[1]}.`)
        break
      case 'cant':
        push('info', `${monName(who)} ${CANT_REASONS[args[1]] ?? "couldn't move!"}`)
        break

      case '-boost':
      case '-unboost': {
        const stat = STAT_NAMES[args[1]] ?? args[1]
        const amount = Number(args[2]) || 0
        if (amount === 0) {
          push('info', `${monName(who)}'s ${stat} won't go any ${cmd === '-boost' ? 'higher' : 'lower'}!`)
        } else {
          const size = amount >= 3 ? ' drastically' : amount === 2 ? ' sharply' : ''
          const change = cmd === '-boost' ? (amount >= 3 ? 'rose drastically' : `rose${size}`) : `fell${amount >= 3 ? ' severely' : amount === 2 ? ' harshly' : ''}`
          push('info', `${monName(who)}'s ${stat} ${change}!`)
        }
        break
      }

      case '-weather': {
        if (args.includes('[upkeep]')) break
        const weather = Dex.conditions.get(args[0]).id
        if (args[0] === 'none') push('info', 'The weather returned to normal.')
        else push('info', WEATHER_START[weather] ?? `${args[0]} started.`)
        break
      }

      case '-terastallize':
        push('info', `${monName(who)} terastallized into the ${args[1]} type!`)
        break

      case '-start': {
        const effect = effectName(args[1])
        if (effect === 'confusion') push('info', `${monName(who)} became confused!`)
        else if (effect === 'Substitute') push('info', `${monName(who)} put in a substitute!`)
        else if (effect === 'Taunt') push('info', `${monName(who)} fell for the taunt!`)
        else if (effect === 'Encore') push('info', `${monName(who)} must do an encore!`)
        break
      }

      case '-ability':
        if (args[1] === 'Pressure') push('info', `${monName(who)} is exerting its Pressure!`)
        else if (args[1] === 'Mold Breaker') push('info', `${monName(who)} breaks the mold!`)
        else if (args[1] !== 'Intimidate') push('info', `${monName(who)}'s ${args[1]} activated!`) // Intimidate shows as the stat drop
        break

      case '-sidestart':
        push('info', `${effectName(args[1])} took effect on ${args[0].startsWith('p1') ? 'your' : "your opponent's"} side!`)
        break

      case '-fieldstart':
        push('info', `${effectName(args[0])} took effect!`)
        break

      case 'win':
        push('result', args[0] === 'You' ? 'You won the battle!' : 'You lost the battle.')
        break
    }
  }

  return events
}