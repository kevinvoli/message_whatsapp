"use client";

import React, { useEffect, useState } from 'react';
import { Phone, CheckCircle, AlertCircle } from 'lucide-react';
import { useChatStore, type ObligationStatus } from '@/store/chatStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const LABELS: Record<keyof Pick<ObligationStatus, 'annulee' | 'livree' | 'sansCommande'>, string> = {
  annulee:      'Annulées',
  livree:       'Livrées',
  sansCommande: 'Sans cmd',
};

export default function ObligationProgressBar() {
  const [status, setStatus] = useState<ObligationStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const setObligationStatus = useChatStore((s) => s.setObligationStatus);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/call-obligations/mine`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json() as ObligationStatus;
          setStatus(data);
          setObligationStatus(data); // partage avec le store
        }
      } catch { /* silencieux */ }
    };
    void load();
    const id = setInterval(() => void load(), 60_000);

    // Rechargement immédiat sur événements socket pertinents
    const handleReload = () => void load();
    window.addEventListener('obligations:reload', handleReload);

    return () => {
      clearInterval(id);
      window.removeEventListener('obligations:reload', handleReload);
    };
  }, [setObligationStatus]);

  if (!status) return null;

  const categories = (['annulee', 'livree', 'sansCommande'] as const);
  const totalDone = categories.reduce((s, k) => s + status[k].done, 0);
  const totalRequired = categories.reduce((s, k) => s + status[k].required, 0);
  const allCallsDone = totalDone >= totalRequired;

  if (status.readyForRotation) return null; // tout bon, pas besoin d'afficher

  return (
    <div className="border-b border-orange-100 bg-orange-50 flex-shrink-0">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full px-3 pt-2 pb-1 flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-orange-600" />
          <span className="text-xs font-semibold text-orange-700">
            Obligations appels — Batch #{status.batchNumber}
          </span>
        </div>
        <span className={`text-xs font-bold ${allCallsDone ? 'text-green-600' : 'text-orange-600'}`}>
          {totalDone}/{totalRequired}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Barre globale */}
          <div className="w-full bg-orange-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all ${allCallsDone ? 'bg-green-500' : 'bg-orange-400'}`}
              style={{ width: `${Math.min((totalDone / totalRequired) * 100, 100)}%` }}
            />
          </div>

          {/* Détail par catégorie */}
          <div className="grid grid-cols-3 gap-1.5">
            {categories.map((key) => {
              const { done, required } = status[key];
              const done5 = done >= required;
              return (
                <div key={key} className={`rounded-lg px-2 py-1 text-center border ${done5 ? 'bg-green-50 border-green-200' : 'bg-white border-orange-200'}`}>
                  <p className="text-[10px] text-gray-500 font-medium truncate">{LABELS[key]}</p>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    {done5
                      ? <CheckCircle className="w-3 h-3 text-green-500" />
                      : <Phone className="w-3 h-3 text-orange-400" />
                    }
                    <span className={`text-xs font-bold ${done5 ? 'text-green-600' : 'text-orange-600'}`}>
                      {done}/{required}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contrôle qualité */}
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${status.qualityCheckPassed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {status.qualityCheckPassed
              ? <CheckCircle className="w-3 h-3 flex-shrink-0" />
              : <AlertCircle className="w-3 h-3 flex-shrink-0" />
            }
            <span>
              {status.qualityCheckPassed
                ? 'Qualité messages bloc actif : OK'
                : 'Qualité messages : répondez aux clients du bloc actif'
              }
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
