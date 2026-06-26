'use client';

import React, { useState } from 'react';
import { Calendar, RotateCw, CheckCircle, AlertCircle } from 'lucide-react';
import { setGroupScheduleConfig, generateGroupSchedule } from '../../lib/api/commercial-groups.api';
import { ScheduleConfigDto } from '../../lib/definitions';

interface ScheduleConfigFormProps {
  groupId: string;
  initialWorkDaysCount?: number;
  initialFirstWorkDay?: string | null;
  onScheduleGenerated: () => void;
}

export default function ScheduleConfigForm({
  groupId,
  initialWorkDaysCount,
  initialFirstWorkDay,
  onScheduleGenerated,
}: ScheduleConfigFormProps) {
  const [workDaysCount, setWorkDaysCount] = useState<number>(initialWorkDaysCount ?? 2);
  const [firstWorkDay, setFirstWorkDay]   = useState<string>(initialFirstWorkDay ?? '');
  const [loading, setLoading]             = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage]     = useState<string | null>(null);

  const handleGenerateAndSave = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!firstWorkDay) {
      setErrorMessage('Veuillez définir un premier jour de travail.');
      return;
    }
    setLoading(true);
    try {
      const dto: ScheduleConfigDto = { workDaysCount, firstWorkDay };
      await setGroupScheduleConfig(groupId, dto);
      const result = await generateGroupSchedule(groupId, 3);
      setSuccessMessage(`Planning généré : ${result.daysGenerated} jours sur 3 mois`);
      onScheduleGenerated();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la génération.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 border border-indigo-100 rounded-lg p-4 space-y-4 bg-indigo-50/40">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-indigo-600" />
        <p className="text-sm font-semibold text-gray-800">Planning de rotation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Jours de travail consécutifs
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={14}
              value={workDaysCount}
              onChange={(e) => setWorkDaysCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              aria-label="Nombre de jours de travail consécutifs"
            />
            <span className="text-xs text-gray-500">
              j. travail / {workDaysCount} j. repos
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Premier jour de travail
          </label>
          <input
            type="date"
            value={firstWorkDay}
            onChange={(e) => setFirstWorkDay(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            aria-label="Premier jour de travail"
          />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Le groupe alternera{' '}
        <span className="font-medium text-gray-600">
          {workDaysCount} j. travail / {workDaysCount} j. repos
        </span>{' '}
        en continu, 7j/7.
      </p>

      <button
        onClick={() => void handleGenerateAndSave()}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors"
        aria-label="Enregistrer la configuration et générer le planning sur 3 mois"
      >
        {loading ? (
          <RotateCw className="w-4 h-4 animate-spin" />
        ) : (
          <Calendar className="w-4 h-4" />
        )}
        {loading ? 'Génération en cours…' : 'Enregistrer et générer (3 mois)'}
      </button>

      {successMessage && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
