import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A small localStorage-backed state hook, used ONLY for lightweight
 * validation-run metadata (see useSessionHistory). It never touches the
 * uploaded Excel file or full validation results - those live in memory
 * for the current session only, per the app's no-persistence design.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  // Mirrors `value` outside of React's own state queue. setAndPersist reads
  // and writes this ref directly (see below) instead of relying on the
  // `prev` React hands an updater function, which is what makes the write
  // below safe to call right before unmounting the calling component.
  const valueRef = useRef(value)
  valueRef.current = value

  const setAndPersist = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(valueRef.current) : next
      valueRef.current = resolved
      // Persisted synchronously, as plain JS, BEFORE telling React about the
      // new value - deliberately not nested inside the setValue() call
      // below. A caller that writes and then immediately triggers a
      // navigation in the same tick (e.g. NewValidation.tsx records a
      // History entry and then calls navigate()) can cause React to discard
      // that pending state update, because React 18 batches both changes
      // together and, on finding the writing component no longer in the
      // tree once the route swaps, drops its queued update without ever
      // invoking the updater function. When the actual localStorage.setItem
      // lived inside that updater (the previous implementation), the write
      // silently never happened - no thrown error, no console output,
      // just a value that was never saved. Writing here first means the
      // data is already on disk before React gets any say in the matter.
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved))
      } catch {
        // Storage full or unavailable (e.g. private browsing) - fail silently.
      }
      setValue(resolved)
    },
    [key]
  )

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== key) return
      try {
        const next = event.newValue ? (JSON.parse(event.newValue) as T) : initialValue
        valueRef.current = next
        setValue(next)
      } catch {
        // ignore malformed external writes
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, setAndPersist]
}
