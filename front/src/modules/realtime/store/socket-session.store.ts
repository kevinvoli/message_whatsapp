/**
 * TICKET-08-A — Slice état socket / session.
 *
 * Gère uniquement la référence Socket et son setter.
 * Utilisé via le StateCreator composé dans chatStore.ts.
 */
import { StateCreator } from 'zustand';
import { Socket } from 'socket.io-client';
import type { ChatState } from '@/store/chatStore';

export interface SocketSessionSlice {
  socket: Socket | null;
  setSocket: (socket: Socket | null) => void;
}

export const createSocketSessionSlice: StateCreator<
  ChatState,
  [],
  [],
  SocketSessionSlice
> = (set) => ({
  socket: null,
  setSocket: (socket) => set({ socket }),
});
