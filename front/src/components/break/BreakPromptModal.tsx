'use client';

import React, { useEffect, useState } from 'react';
import type { BreakPromptPayload } from '@/hooks/useBreakPrompt';

interface BreakPromptModalProps {
  prompt: BreakPromptPayload | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onTakeBreak: () => void | Promise<void>;
}

export default function BreakPromptModal({ prompt, audioRef, onTakeBreak }: BreakPromptModalProps) {
  const [remainingMinutes, setRemainingMinutes] = useState(0);

  useEffect(() => {
    if (!prompt) return;

    const compute = () =>
      Math.max(0, Math.ceil((new Date(prompt.expiresAt).getTime() - Date.now()) / 60000));

    setRemainingMinutes(compute());
    const interval = setInterval(() => setRemainingMinutes(compute()), 1000);
    return () => clearInterval(interval);
  }, [prompt?.expiresAt]);

  if (!prompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          C&apos;est l&apos;heure de ta pause&nbsp;!
        </h2>
        <p className="text-sm text-gray-500 mb-4">{prompt.subGroupName}</p>

        {prompt.messageText && (
          <p className="text-gray-700 mb-4">{prompt.messageText}</p>
        )}

        <p className="text-sm text-gray-500 mb-6">
          Fin dans <span className="font-semibold text-gray-800">{remainingMinutes} min</span>
        </p>

        <audio ref={audioRef} className="hidden" />

        <div className="flex justify-center">
          <button
            onClick={onTakeBreak}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Prendre ma pause
          </button>
        </div>
      </div>
    </div>
  );
}
