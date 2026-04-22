"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle, Circle, ClipboardList, X } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type ClientInterest = 'tres_interesse' | 'interesse' | 'peu_interesse' | 'pas_interesse';
type NextAction    = 'rappeler' | 'envoyer_devis' | 'relancer' | 'fermer' | 'archiver';

interface GicopReport {
  id?: string;
  clientInterest: ClientInterest | null;
  hasOrder: boolean | null;
  nextAction: NextAction | null;
  orderAmount: number | null;
  nextActionAt: string | null;
  objections: string | null;
  notes: string | null;
  isComplete: boolean;
  isValidated: boolean;
}

const INTEREST_LABELS: Record<ClientInterest, string> = {
  tres_interesse: 'Très intéressé',
  interesse:      'Intéressé',
  peu_interesse:  'Peu intéressé',
  pas_interesse:  'Pas intéressé',
};

const ACTION_LABELS: Record<NextAction, string> = {
  rappeler:      'Rappeler',
  envoyer_devis: 'Envoyer devis',
  relancer:      'Relancer',
  fermer:        'Fermer',
  archiver:      'Archiver',
};

interface Props {
  chatId: string;
  onClose: () => void;
}

export default function GicopReportPanel({ chatId, onClose }: Props) {
  const [report, setReport] = useState<GicopReport>({
    clientInterest: null,
    hasOrder: null,
    nextAction: null,
    orderAmount: null,
    nextActionAt: null,
    objections: null,
    notes: null,
    isComplete: false,
    isValidated: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/gicop-report/${chatId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setReport(data as GicopReport); })
      .catch(() => {});
  }, [chatId]);

  const save = useCallback(async (patch: Partial<GicopReport>) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API_URL}/gicop-report/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json() as GicopReport;
        setReport(updated);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }, [chatId]);

  const debouncedSave = useCallback((patch: Partial<GicopReport>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(patch), 800);
  }, [save]);

  const set = <K extends keyof GicopReport>(key: K, val: GicopReport[K]) => {
    const updated = { ...report, [key]: val };
    setReport(updated);
    debouncedSave({ [key]: val });
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-80 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm text-gray-800">Rapport GICOP</span>
          {report.isComplete && (
            <span className="flex items-center gap-0.5 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
              <CheckCircle className="w-3 h-3" /> Complet
            </span>
          )}
          {!report.isComplete && (
            <span className="flex items-center gap-0.5 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
              <Circle className="w-3 h-3" /> Incomplet
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">

        {/* Intérêt client */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Intérêt client <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(INTEREST_LABELS) as [ClientInterest, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => set('clientInterest', val)}
                className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  report.clientInterest === val
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Commande */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Commande prévue <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                onClick={() => set('hasOrder', val)}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  report.hasOrder === val
                    ? val ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}
              >
                {val ? 'Oui' : 'Non'}
              </button>
            ))}
          </div>
          {report.hasOrder && (
            <input
              type="number"
              placeholder="Montant estimé (FCFA)"
              value={report.orderAmount ?? ''}
              onChange={(e) => set('orderAmount', e.target.value ? Number(e.target.value) : null)}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
          )}
        </div>

        {/* Prochaine action */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Prochaine action <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(ACTION_LABELS) as [NextAction, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => set('nextAction', val)}
                className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  report.nextAction === val
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {report.nextAction && report.nextAction !== 'fermer' && report.nextAction !== 'archiver' && (
            <input
              type="datetime-local"
              value={report.nextActionAt?.slice(0, 16) ?? ''}
              onChange={(e) => set('nextActionAt', e.target.value || null)}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
          )}
        </div>

        {/* Objections */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Objections
          </label>
          <textarea
            placeholder="Objections rencontrées..."
            value={report.objections ?? ''}
            rows={2}
            onChange={(e) => set('objections', e.target.value || null)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Notes libres
          </label>
          <textarea
            placeholder="Notes, contexte, observations..."
            value={report.notes ?? ''}
            rows={3}
            onChange={(e) => set('notes', e.target.value || null)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>
      </div>

      {/* Footer statut */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : ''}
        </span>
        {report.isValidated && (
          <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
            Validé par superviseur
          </span>
        )}
      </div>
    </div>
  );
}
