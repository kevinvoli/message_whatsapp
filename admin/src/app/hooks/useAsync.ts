'use client';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fnRef.current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // deps est fourni par l'appelant ; fnRef est stable par construction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return { data, loading, error, reload };
}
