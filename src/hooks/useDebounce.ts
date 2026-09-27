import { useEffect, useState } from 'react';

/** Espera a que la persona deje de escribir antes de buscar. */
export function useDebounce<T>(value: T, ms = 300): T {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return delayed;
}
