import { useEffect, useRef, useCallback } from 'react';

interface UseRealtimePollingOptions {
  /** Polling interval in milliseconds (default: 5000) */
  interval?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook that polls a callback at a regular interval for near-realtime updates.
 * Used by the admin dashboard to refresh queue, conversations, and metrics.
 *
 * The callback is NOT called on mount (initial fetch is the caller's responsibility).
 */
export function useRealtimePolling(
  callback: () => void | Promise<void>,
  options: UseRealtimePollingOptions = {},
) {
  const { interval = 5000, enabled = true } = options;
  const savedCallback = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    timerRef.current = setInterval(() => {
      void savedCallback.current();
    }, interval);

    return stop;
  }, [interval, enabled, stop]);

  return { stop };
}
