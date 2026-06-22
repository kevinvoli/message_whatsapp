'use client';

import React from 'react';
import { Tag, X } from 'lucide-react';
import { AiQualifyResult } from '@/lib/aiApi';

interface AiQualifyModalProps {
  loading: boolean;
  result: AiQualifyResult | null;
  onClose: () => void;
}

export default function AiQualifyModal({ loading, result, onClose }: AiQualifyModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600" />
            Qualification IA
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Fermer la qualification IA"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Qualification en cours…</p>
          </div>
        ) : result ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 bg-indigo-50 rounded-xl px-4 py-3">
              <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wide w-24 flex-shrink-0 mt-0.5">
                Résultat
              </span>
              <p className="text-sm text-gray-800 font-medium">{result.outcome}</p>
            </div>
            <div className="flex items-start gap-3 bg-emerald-50 rounded-xl px-4 py-3">
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide w-24 flex-shrink-0 mt-0.5">
                Intérêt
              </span>
              <p className="text-sm text-gray-800">{result.interest}</p>
            </div>
            {result.objection !== null && (
              <div className="flex items-start gap-3 bg-orange-50 rounded-xl px-4 py-3">
                <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide w-24 flex-shrink-0 mt-0.5">
                  Objection
                </span>
                <p className="text-sm text-gray-800">{result.objection}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Qualification indisponible.</p>
        )}
      </div>
    </div>
  );
}
