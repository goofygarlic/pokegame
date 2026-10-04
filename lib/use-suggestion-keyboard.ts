import { useEffect, useState, type KeyboardEvent } from 'react'

interface Options {
  listId: string // id of the suggestion <ul>; each option's id is `${listId}-${index}`
  suggestions: string[]
  open: boolean // whether the dropdown is currently showing
  onOpen: () => void // show the dropdown
  onClose: () => void // hide the dropdown
  onPick: (value: string) => void // fill the search box with a suggestion
  onSubmit: () => void // submit whatever is in the search box
}

// Keyboard support for the Pokémon search dropdowns:
//   ↓ / ↑   move through the suggestions (wrapping around)
//   Enter   fills the box with the highlighted suggestion, or submits if none is highlighted
//   Escape  closes the dropdown
export function useSuggestionKeyboard({ listId, suggestions, open, onOpen, onClose, onPick, onSubmit }: Options) {
  // The highlight belongs to one specific list of suggestions. When the list
  // changes (the player types), the stored key no longer matches and the
  // highlight resets to "nothing selected".
  const listKey = suggestions.join('|')
  const [nav, setNav] = useState({ listKey: '', index: -1 })
  const activeIndex = open && nav.listKey === listKey ? nav.index : -1

  // Keep the highlighted option visible when the list scrolls.
  useEffect(() => {
    if (activeIndex < 0) return
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listId])

  function setActiveIndex(index: number) {
    setNav({ listKey, index })
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const count = suggestions.length

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (count === 0) return
      e.preventDefault() // stop the cursor jumping to the start/end of the text

      if (!open) {
        onOpen()
        setActiveIndex(e.key === 'ArrowDown' ? 0 : count - 1)
        return
      }

      const next =
        e.key === 'ArrowDown'
          ? (activeIndex + 1) % count
          : activeIndex <= 0
            ? count - 1
            : activeIndex - 1
      setActiveIndex(next)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < count) {
        onPick(suggestions[activeIndex])
      } else {
        onSubmit()
      }
      return
    }

    if (e.key === 'Escape') {
      onClose()
    }
  }

  return { activeIndex, setActiveIndex, onKeyDown }
}