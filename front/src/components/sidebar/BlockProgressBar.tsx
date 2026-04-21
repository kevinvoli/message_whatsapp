import React from 'react';
import { CheckCircle, Lock } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

export default function BlockProgressBar() {
  const blockProgress = useChatStore((state) => state.blockProgress);

  if (!blockProgress || blockProgress.total === 0) return null;

  const { validated, total } = blockProgress;
  const pct = Math.round((validated / total) * 100);
  const allDone = validated >= total;

  return (
    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
          {allDone ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-gray-400" />
          )}
          Bloc en cours
        </span>
        <span className={`text-xs font-semibold ${allDone ? 'text-green-600' : 'text-gray-700'}`}>
          {validated} / {total}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${
            allDone ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {allDone && (
        <p className="text-xs text-green-600 mt-1 font-medium">
          ✓ Toutes les conversations validées — rotation en cours…
        </p>
      )}
    </div>
  );
}
