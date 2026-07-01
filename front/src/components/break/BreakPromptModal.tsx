'use client';

import type { BreakPromptPayload } from '@/hooks/useBreakPrompt';

interface BreakPromptBannerProps {
  prompt: BreakPromptPayload | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onTakeBreak: () => void | Promise<void>;
}

export default function BreakPromptModal({ prompt, audioRef, onTakeBreak }: BreakPromptBannerProps) {
  if (!prompt) return null;

  return (
    <>
      <audio ref={audioRef} className="hidden" />
      <div className="h-5 bg-orange-500 flex items-center justify-between px-3 gap-2 shrink-0">
        <span className="text-white text-xs leading-none truncate">
          Pause — {prompt.subGroupName} — fin à {prompt.endTime}
        </span>
        <button
          onClick={onTakeBreak}
          className="text-white text-xs leading-none shrink-0 hover:underline whitespace-nowrap"
        >
          Prendre
        </button>
      </div>
    </>
  );
}
