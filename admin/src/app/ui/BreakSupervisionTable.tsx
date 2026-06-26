'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { BreakSupervisionRow } from '@/app/lib/definitions';

interface BreakSupervisionTableProps {
  rows?: BreakSupervisionRow[];
}

export default function BreakSupervisionTable({ rows = [] }: BreakSupervisionTableProps) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
      <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-800">Supervision des pauses</p>
        <p className="text-xs text-amber-600 mt-1">
          En cours d&apos;implémentation (Sprint 3) — {rows.length} ligne{rows.length !== 1 ? 's' : ''} disponible{rows.length !== 1 ? 's' : ''}.
        </p>
      </div>
    </div>
  );
}
