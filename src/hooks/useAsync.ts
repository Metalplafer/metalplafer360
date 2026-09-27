import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errors';

/**
 * Carga datos con estado de carga y error, y permite recargar.
 * Descarta respuestas de peticiones antiguas para evitar parpadeos.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id === seq.current) setData(result);
    } catch (e) {
      if (id === seq.current) setError(toUserMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}
