'use client';
import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/contexts/SocketProvider';
import { BREAK_EVENTS } from '@/lib/socket/socket-events.constants';
import { takeBreak } from '@/lib/api';

export type BreakPromptPayload = {
  breakScheduleId: string;
  subGroupName: string;
  endTime: string;
  messageText: string | null;
  audioUrl: string | null;
  reminderIntervalMinutes: number;
  expiresAt: string;
};

export function useBreakPrompt() {
  const { socket } = useSocket();
  const [prompt, setPrompt] = useState<BreakPromptPayload | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handlePrompt = (payload: BreakPromptPayload) => {
      setPrompt(payload);
      if (payload.audioUrl && audioRef.current) {
        audioRef.current.src = payload.audioUrl;
        audioRef.current.play().catch((err: Error) => {
          console.warn('[BreakPrompt] Lecture audio bloquée :', err.message);
        });
      }
    };

    const handleClear = (_payload: { breakScheduleId: string; reason: 'taken' | 'expired' }) => {
      setPrompt(null);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };

    socket.on(BREAK_EVENTS.BREAK_PROMPT, handlePrompt);
    socket.on(BREAK_EVENTS.BREAK_PROMPT_CLEAR, handleClear);

    return () => {
      socket.off(BREAK_EVENTS.BREAK_PROMPT, handlePrompt);
      socket.off(BREAK_EVENTS.BREAK_PROMPT_CLEAR, handleClear);
    };
  }, [socket]);

  const handleTakeBreak = async () => {
    if (!prompt) return;
    await takeBreak(prompt.breakScheduleId);
    setPrompt(null);
  };

  return { prompt, audioRef, handleTakeBreak };
}
