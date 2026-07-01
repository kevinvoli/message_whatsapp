'use client';
import { useState, useEffect } from 'react';
import type { CommercialPlanningEntry } from '@/lib/definitions';
import { getPlanningToday, getPlanningMonth } from '@/lib/api';

export function usePlanningJour() {
  const [planning, setPlanning] = useState<CommercialPlanningEntry | null | 'loading'>('loading');

  useEffect(() => {
    getPlanningToday()
      .then(setPlanning)
      .catch(() => setPlanning(null));
  }, []);

  return { planning };
}

export function usePlanningMois(year: number, month: number) {
  const [entries, setEntries] = useState<CommercialPlanningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    getPlanningMonth(year, month)
      .then((r) => { if (!ignore) setEntries(r); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [year, month]);

  return { entries, loading };
}
