'use client';

import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface ReadCooldownModalProps {
  remainingMs: number;
  onClose: () => void;
}

const ReadCooldownModal: React.FC<ReadCooldownModalProps> = ({ remainingMs: initialRemainingMs, onClose }) => {
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs);

  useEffect(() => {
    if (remainingMs <= 0) {
      onClose();
      return;
    }
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(interval);
          onClose();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeLabel = minutes > 0
    ? `${minutes} min ${seconds} s`
    : `${seconds} s`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <Clock className="text-orange-500" size={24} />
          <h2 className="text-lg font-semibold text-gray-900">Veuillez patienter</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Vous ne pouvez pas ouvrir plusieurs messages non lus en même temps.
          Vous devez patienter avant de cliquer sur un autre message non lu.
        </p>
        <p className="text-center text-lg font-medium text-orange-600 mb-6">
          Temps restant : {timeLabel}
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReadCooldownModal;
