// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Contact  } from "@/types/chat";

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
    console.log("novelle contacts");

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

    // 🔔 Charge les messages + déclenche le READ côté backend
    const socket = get().socket;
    socket?.emit("contact:get", { contact_id });
  },

  setContacts: (contacts) => {
    console.log("=======track1 setContacts=======", contacts);

    set({ contacts, isLoading: false });
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
