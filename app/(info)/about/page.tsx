import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../info.module.css'

export const metadata: Metadata = {
  title: 'About · PokeGame',
}

export default function AboutPage() {
  return (
    <>
      <h1>About PokeGame</h1>
      <p className={styles.lead}>
        PokeGame is a small collection of daily Pokémon puzzles. Every day at midnight Eastern Time, each game gets a
        new Pokémon, and everyone plays the same one.
      </p>

      <h2>The games</h2>
      <ul>
        <li>
          <strong>Pokédle:</strong> guess today&apos;s Pokémon. Each guess shows how its type, generation, height,
          weight, and color compare to the answer.
        </li>
        <li>
          <strong>Guess the Pokémon:</strong> reveal hints like egg groups, weaknesses, or its cry, then name it. The
          fewer points you spend, the better the ball you earn.
        </li>
      </ul>

      <h2>How it&apos;s built</h2>
      <p>
        PokeGame runs on Next.js and is hosted on Vercel, with Supabase storing puzzles and progress. Pokémon data and
        sprites come from <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokeAPI</a>, a free,
        community-run Pokémon database.
      </p>

      <h2>Who made it</h2>
      <p>
        PokeGame is built and maintained by Karthik Yagnamurthy. The source code is on{' '}
        <a href="https://github.com/goofygarlic/PokeGame" target="_blank" rel="noreferrer">
          GitHub
        </a>
        . Questions, bug reports, or ideas for new games are always welcome on the{' '}
        <Link href="/contact">Contact</Link> page.
      </p>

      <h2>Credits</h2>
      <ul>
        <li>
          <strong>Pokémon data:</strong>{' '}
          <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokeAPI</a> and its contributors.
        </li>
        <li>
          <strong>Pokémon sprites:</strong> served by the{' '}
          <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">PokeAPI sprites</a> project.
          Sprites for Pokémon after No. 649 are fan-made Black &amp; White–style sprites from the{' '}
          <a href="https://www.smogon.com" target="_blank" rel="noreferrer">Smogon</a> community, and Generation 9
          sprites are by{' '}
          <a href="https://www.deviantart.com/kingofthe-x-roads" target="_blank" rel="noreferrer">KingOfThe-X-Roads</a>.
        </li>
        <li>
          <strong>Poké Ball icons:</strong> item sprites from the{' '}
          <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">PokeAPI sprites</a> project.
        </li>
        <li>
          <strong>Pokémon cries:</strong> the{' '}
          <a href="https://github.com/PokeAPI/cries" target="_blank" rel="noreferrer">PokeAPI cries</a> project,
          collected from <a href="https://play.pokemonshowdown.com" target="_blank" rel="noreferrer">Pokémon Showdown</a>{' '}
          and <a href="https://veekun.com" target="_blank" rel="noreferrer">Veekun</a>.
        </li>
        <li>
          <strong>Battle simulation:</strong>{' '}
          <a href="https://github.com/smogon/pokemon-showdown" target="_blank" rel="noreferrer">Pokémon Showdown</a>
          &apos;s battle engine (MIT license), packaged by{' '}
          <a href="https://github.com/pkmn/ps" target="_blank" rel="noreferrer">@pkmn/sim</a>, with damage estimates
          from the{' '}
          <a href="https://github.com/smogon/damage-calc" target="_blank" rel="noreferrer">Smogon damage calculator</a>.
        </li>
        <li>
          <strong>Fonts:</strong> Fraunces, Work Sans, and JetBrains Mono, via Google Fonts under the SIL Open Font
          License.
        </li>
      </ul>

      <p className={styles.note}>
        PokeGame is an unofficial fan project. Pokémon and Pokémon character names are trademarks of Nintendo,
        Creatures Inc., and GAME FREAK inc. Official Pokémon images and sounds are © The Pokémon Company. This site
        is not affiliated with or endorsed by them.
      </p>
    </>
  )
}