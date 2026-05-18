'use client';

import React, { useState } from 'react';
import { Calendar, RotateCw, Save, CheckCircle, AlertCircle } from 'lucide-react';
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
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [successMessage, setSuccessMessage]   = useState<string | null>(null);
  const [errorMessage, setErrorMessage]       = useState<string | null>(null);

  const clearMessages = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleSaveConfig = async () => {
    clearMessages();
    setLoadingConfig(true);
    try {
      const dto: ScheduleConfigDto = {
        workDaysCount,
        firstWorkDay,
      };
      await setGroupScheduleConfig(groupId, dto);
      setSuccessMessage('Configuration enregistrée avec succès.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement.';
      setErrorMessage(message);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleGenerate = async () => {
    clearMessages();
    if (!firstWorkDay) {
      setErrorMessage('Veuillez définir un premier jour de travail.');
      return;
    }
    setLoadingGenerate(true);
    try {
      const result = await generateGroupSchedule(groupId, 3);
      setSuccessMessage(`Planning généré : ${result.daysGenerated} jours`);
      onScheduleGenerated();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la génération.';
      setErrorMessage(message);
    } finally {
      setLoadingGenerate(false);
    }
  };

  return (
    <div className="mt-6 border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-indigo-600" />
        <p className="text-sm font-semibold text-gray-800">Emploi du temps</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Rythme (jours consécutifs de travail)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={30}
            value={workDaysCount}
            onChange={(e) => setWorkDaysCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            aria-label="Nombre de jours de travail consécutifs"
          />
          <span className="text-sm text-gray-500">jours de travail / repos</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Premier jour de travail
        </label>
        <input
          type="date"
          value={firstWorkDay}
          onChange={(e) => setFirstWorkDay(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          aria-label="Premier jour de travail"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handleSaveConfig()}
          disabled={loadingConfig}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-indigo-200 text-indigo-700 bg-white rounded-lg hover:bg-indigo-50 disabled:opacity-50 font-medium"
          aria-label="Enregistrer la configuration de planning"
        >
          {loadingConfig ? (
            <RotateCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Enregistrer la config
        </button>

        <button
          onClick={() => void handleGenerate()}
          disabled={loadingGenerate}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
          aria-label="Générer le planning sur 3 mois"
        >
          {loadingGenerate ? (
            <RotateCw className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
          Generer 3 mois
        </button>
      </div>

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
