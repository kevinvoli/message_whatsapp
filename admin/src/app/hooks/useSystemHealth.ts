import { useState, useEffect, useCallback } from 'react';
import { getSystemHealthStatus, SystemHealthStatus } from '@/app/lib/api';

const POLL_INTERVAL_MS = 30_000; // 30 secondes

export function useSystemHealth() {
    const [status, setStatus] = useState<SystemHealthStatus | null>(null);

    const poll = useCallback(async () => {
        try {
            const result = await getSystemHealthStatus();
            setStatus(result);
        } catch {
            // Silencieux — on garde le dernier état connu
        }
    }, []);

    useEffect(() => {
        void poll();
        const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [poll]);

    return status;
}
