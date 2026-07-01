'use client';
import { usePlanningJour } from '@/hooks/usePlanningCommercial';

const SLOT_LABELS: Record<string, string> = {
  full: 'Journée complète',
  morning: 'Matin',
  afternoon: 'Après-midi',
};

export function PlanningBadgeJour() {
  const { planning } = usePlanningJour();

  if (planning === 'loading' || planning === null) return null;

  const label = planning.type === 'absence' ? 'Absent(e)' : 'Mission exceptionnelle';
  const slot = SLOT_LABELS[planning.timeSlot] ?? '';

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1.5 rounded-md flex items-center gap-2">
      <span className="font-medium">{label}</span>
      <span className="text-amber-600">— {slot}</span>
      {planning.reason && (
        <span className="text-amber-500 truncate max-w-40">({planning.reason})</span>
      )}
    </div>
  );
}
