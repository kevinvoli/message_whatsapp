// src/socket/socket.listeners.ts
import { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "./socket.event";

export const registerSocketListeners = (
  socket: Socket,
  handlers: ReturnType<any>
) => {
  socket.on(SOCKET_EVENTS.CONNECT, () =>
    handlers.onConnect(socket.id)
  );

  socket.on(SOCKET_EVENTS.DISCONNECT, handlers.onDisconnect);

  socket.on(SOCKET_EVENTS.CONVERSATION.LIST, (data) =>
    handlers.onConversationList(data.conversations)
  );

  socket.on(SOCKET_EVENTS.MESSAGE.GET, (data) =>
    handlers.onMessages(data.conversationId, data.messages)
  );

  socket.on(SOCKET_EVENTS.MESSAGE.RECEIVED, (data) =>
    handlers.onMessageReceived(data.conversationId, data.message)
  );
};
