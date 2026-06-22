'use client';

import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { AiSummaryResult } from '@/lib/aiApi';

interface AiSummaryModalProps {
  loading: boolean;
  result: AiSummaryResult | null;
  onClose: () => void;
}

export default function AiSummaryModal({ loading, result, onClose }: AiSummaryModalProps) {
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
            <Sparkles className="w-4 h-4 text-purple-600" />
            Résumé IA
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Fermer le résumé IA"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Analyse de la conversation…</p>
          </div>
        ) : result ? (
          <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Résumé indisponible.</p>
        )}
      </div>
    </div>
  );
}
