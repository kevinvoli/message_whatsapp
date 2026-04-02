// src/store/contactStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Contact, CallLog } from "@/types/chat";
import { logger } from "@/lib/logger";

interface ContactState {
  socket: Socket | null;
  /** Contact chargé en détail (avec messages) lors d'un clic — null tant que non sélectionné. */
  selectedContactDetail: Contact | null;
  /** Vrai pendant le chargement du détail depuis le backend. */
  isLoadingDetail: boolean;
  /** Historique des appels indexé par contact_id. */
  callLogs: Record<string, CallLog[]>;

  // Actions
  setSocket: (socket: Socket | null) => void;
  /** Émet contact:get_detail au backend pour charger le contact complet (messages inclus). */
  selectContactByChatId: (chatId: string) => void;
  /** Met à jour le détail sélectionné (après update call status, etc.). */
  upsertContact: (contact: Partial<Contact> & { id: string }) => void;
  /** Vide le détail si c'est le contact supprimé. */
  removeContact: (contactId: string) => void;
  /** Appelé par WebSocketEvents quand CONTACT_DETAIL arrive. */
  setSelectedContactDetail: (contact: Contact | null) => void;
  /** Stocke la liste complète des logs d'un contact. */
  setCallLogs: (contactId: string, logs: CallLog[]) => void;
  /** Ajoute un nouveau log en tête de liste. */
  addCallLog: (log: CallLog) => void;
  reset: () => void;
}

const initialState: Omit<
  ContactState,
  | "setSocket"
  | "selectContactByChatId"
  | "upsertContact"
  | "removeContact"
  | "setSelectedContactDetail"
  | "setCallLogs"
  | "addCallLog"
  | "reset"
> = {
  socket: null,
  selectedContactDetail: null,
  isLoadingDetail: false,
  callLogs: {},
};

export const useContactStore = create<ContactState>((set, get) => ({
  ...initialState,

  setSocket: (socket) => set({ socket }),

  selectContactByChatId: (chatId: string) => {
    const { socket, selectedContactDetail } = get();
    if (!socket) return;

    // Éviter un rechargement si c'est déjà le même contact
    if (selectedContactDetail?.chat_id === chatId) return;

    set({ isLoadingDetail: true, selectedContactDetail: null });
    logger.debug("Contact detail requested", { chatId });
    socket.emit("contact:get_detail", { chat_id: chatId });

    // Charge aussi l'historique des appels si l'id est déjà connu
    // (sera rechargé depuis CONTACT_DETAIL une fois reçu)
  },

  setSelectedContactDetail: (contact) => {
    set({ selectedContactDetail: contact, isLoadingDetail: false });
    // Charge l'historique des appels
    if (contact) {
      const { socket } = get();
      socket?.emit("call_logs:get", { contact_id: contact.id });
    }
  },

  upsertContact: (contact) => {
    set((state) => {
      if (!state.selectedContactDetail) return state;
      if (state.selectedContactDetail.id !== contact.id) return state;
      return {
        selectedContactDetail: { ...state.selectedContactDetail, ...contact },
      };
    });
  },

  removeContact: (contactId) => {
    set((state) => ({
      selectedContactDetail:
        state.selectedContactDetail?.id === contactId
          ? null
          : state.selectedContactDetail,
    }));
  },

  setCallLogs: (contactId, logs) => {
    set((state) => ({
      callLogs: { ...state.callLogs, [contactId]: logs },
    }));
  },

  addCallLog: (log) => {
    set((state) => {
      const existing = state.callLogs[log.contact_id] ?? [];
      return {
        callLogs: {
          ...state.callLogs,
          [log.contact_id]: [log, ...existing],
        },
      };
    });
  },

  reset: () => set({ ...initialState }),
}));
