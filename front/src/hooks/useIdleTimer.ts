import { useCallback, useEffect, useRef, useState } from 'react';

export function useIdleTimer(idleMinutes: number, warningSeconds: number) {
  const lastActivityRef = useRef<number>(Date.now());
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(idleMinutes * 60);
  const [showWarning, setShowWarning] = useState(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    const totalSeconds = idleMinutes * 60;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);

      setIdleSeconds(elapsed);
      setRemainingSeconds(remaining);
      setShowWarning(elapsed >= totalSeconds - warningSeconds);

      if (remaining <= 0) {
        clearInterval(interval);
        window.location.replace('/login?reason=idle');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [idleMinutes, warningSeconds]);

  return { showWarning, idleSeconds, remainingSeconds, resetActivity };
}
