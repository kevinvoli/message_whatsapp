// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Contact  } from "@/types/chat";
import { logger } from "@/lib/logger";

interface ContactState {
  socket: Socket | null;
  selectedContact: Contact | null;
  isLoading: boolean;
  error: string | null;
  contacts: Contact[];
  // Actions
  setSocket: (socket: Socket | null) => void;
  // Setters for WebSocket events
  selectContact: (contact_id: string) => void;
  setContacts: (contact: Contact[]) => void;
  upsertContact: (contact: Contact) => void;
  removeContact: (contact_id: string) => void;
  // updateContactStatus: (contact: Contact) => void;
  loadContacts: () => void;
  reset: () => void;
}

const initialState: Omit<
  ContactState,
  | "setSocket"
  | "selectContact"
  | "loadContacts"
  | "setContacts"
  | "updateContactStatus"
  | "reset"
 

> = {
  contacts: [],
  selectedContact: null,
  isLoading: false,
  error: null,
  socket: null,
};


export const useContactStore = create<ContactState>((set, get) => ({
  ...initialState,

  setSocket: (socket) => set({ socket }),

  loadContacts: () => {
    const { socket } = get();
    if (!socket) return;

    set({ isLoading: true });
    logger.debug("Contacts load requested");

    socket?.emit("contacts:get");
  },

  
  selectContact: (contact_id: string) => {
    set((state) => {
      const contact = state.contacts.find(
        (c) => c.id === contact_id,
      );

      if (!contact) return state;

      return {
        selectedContact: { ...contact, unreadCount: 0 },
        contacts: state.contacts.map((c) =>
          c.id === contact_id ? { ...c, unreadCount: 0 } : c,
        ),
        messages: [],
        isLoading: true,
      };
    });

    // Charge les messages + declenche le READ cote backend
  },

  setContacts: (contacts) => {
    logger.debug("Contacts loaded", { count: contacts.length });

    set({ contacts, isLoading: false });
  },

  upsertContact: (contact) => {
    set((state) => {
      const existingIndex = state.contacts.findIndex(
        (c) => c.id === contact.id,
      );
      const nextContacts =
        existingIndex === -1
          ? [contact, ...state.contacts]
          : state.contacts.map((c) =>
              c.id === contact.id ? { ...c, ...contact } : c,
            );

      const nextSelected =
        state.selectedContact?.id === contact.id
          ? { ...state.selectedContact, ...contact }
          : state.selectedContact;

      return {
        contacts: nextContacts,
        selectedContact: nextSelected,
      };
    });
  },

  removeContact: (contact_id) => {
    set((state) => {
      const nextContacts = state.contacts.filter((c) => c.id !== contact_id);
      const nextSelected =
        state.selectedContact?.id === contact_id ? null : state.selectedContact;

      return {
        contacts: nextContacts,
        selectedContact: nextSelected,
      };
    });
  },





  // update: (updatedContact: Contact) => {
  //   set((state) => {
  //     const isSelected =
  //       state.selectedContact?.id === updatedContact.id;

  //   });
  // },

  // updateContactStatus: (
  //   contact_id: string | undefined,
  //   messageId: string,
  //   status: Contact["call_status"],
  // ) => {
  //   return set((state) => {
  //     if (state.selectedContact?.chat_id !== contact_id) return state;

  //     return {
  //       contact: state.contact.map((m) => m.id === messageId ? { ...m, call_status: status } : m

  //       ),
  //     };
  //   });
  // },
  
  reset: () => set({ ...initialState }),
}));

