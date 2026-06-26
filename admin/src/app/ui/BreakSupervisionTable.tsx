'use client';

import React from 'react';
import { BreakSupervisionRow } from '@/app/lib/definitions';
import { formatTime } from '@/app/lib/dateUtils';

const STATUS_LABELS: Record<BreakSupervisionRow['status'], { label: string; className: string }> = {
  en_service:   { label: 'En service',    className: 'bg-green-100 text-green-800' },
  en_pause:     { label: 'En pause',      className: 'bg-blue-100 text-blue-800' },
  pause_manquee:{ label: 'Pause manquée', className: 'bg-orange-100 text-orange-800' },
  deconnecte:   { label: 'Déconnecté',    className: 'bg-red-100 text-red-800' },
  repos:        { label: 'Repos',         className: 'bg-gray-100 text-gray-600' },
  absent:       { label: 'Absent',        className: 'bg-yellow-100 text-yellow-800' },
};

interface BreakSupervisionTableProps {
  rows?: BreakSupervisionRow[];
}

export default function BreakSupervisionTable({ rows = [] }: BreakSupervisionTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Aucun commercial à superviser.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Commercial</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Sous-groupe</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Plage pause</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Pause prise</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Déconnexion</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => {
            const s = STATUS_LABELS[row.status];
            return (
              <tr key={row.commercialId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{row.commercialName}</td>
                <td className="px-4 py-3 text-gray-600">{row.subGroupName ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {row.scheduledBreak
                    ? `${row.scheduledBreak.startTime} – ${row.scheduledBreak.endTime}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {row.hasTakenBreak
                    ? (row.breakTakenAt ? formatTime(row.breakTakenAt) : 'Oui')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {row.disconnectDurationMinutes !== null
                    ? `${row.disconnectDurationMinutes} min`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
