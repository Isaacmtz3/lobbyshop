import { useEffect, useRef, useState } from 'react'
import { searchAddress, type AddressSuggestion } from '../lib/mapbox'

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: AddressSuggestion) => void
}

export function AddressAutocomplete({ value, onChange, onSelect }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleChange(next: string) {
    onChange(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const results = await searchAddress(next)
      setSuggestions(results)
      setOpen(results.length > 0)
    }, 300)
  }

  function handleSelect(suggestion: AddressSuggestion) {
    onSelect(suggestion)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        placeholder="Start typing your shop's address…"
        className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone placeholder:text-mute/60"
      />
      {open && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-line bg-panel2 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="block w-full px-3 py-2.5 text-left text-sm text-bone hover:bg-panel"
              >
                {s.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
