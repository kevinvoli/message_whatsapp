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
    <>
      <audio ref={audioRef} className="hidden" />
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slow-pulse">
        <div className="bg-orange-500 text-white px-6 py-4 shadow-2xl">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base leading-tight">
                C&apos;est l&apos;heure de ta pause — {prompt.subGroupName}
              </p>
              {prompt.messageText && (
                <p className="text-sm text-orange-100 mt-0.5 leading-snug">
                  {prompt.messageText}
                </p>
              )}
              <p className="text-xs text-orange-200 mt-1">
                Fin dans <span className="font-bold text-white">{remainingMinutes} min</span>
              </p>
            </div>
            <button
              onClick={onTakeBreak}
              className="shrink-0 px-5 py-2 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors text-sm"
            >
              Prendre ma pause
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
