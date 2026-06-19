'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface IdleWarningModalProps {
  idleSeconds: number;
  remainingSeconds: number;
  onStillHere: () => void;
}

const IdleWarningModal: React.FC<IdleWarningModalProps> = ({
  idleSeconds,
  remainingSeconds,
  onStillHere,
}) => {
  const idleMinutes = Math.floor(idleSeconds / 60);
  const idleSecs = idleSeconds % 60;
  const idleLabel = idleMinutes > 0
    ? `${idleMinutes} min ${idleSecs} s`
    : `${idleSecs} s`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onStillHere}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-yellow-500" size={24} />
          <h2 className="text-lg font-semibold text-gray-900">Inactivité détectée</h2>
        </div>
        <p className="text-gray-600 mb-2">
          Vous n&apos;avez effectué aucune action depuis{' '}
          <span className="font-semibold text-gray-800">{idleLabel}</span>.
        </p>
        <p className="text-gray-600 mb-4">Vous serez déconnecté dans :</p>
        <p className="text-center text-4xl font-bold text-red-600 mb-6">
          {remainingSeconds}
        </p>
        <div className="flex justify-center">
          <button
            onClick={onStillHere}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Je suis toujours là
          </button>
        </div>
      </div>
    </div>
  );
};

export default IdleWarningModal;
