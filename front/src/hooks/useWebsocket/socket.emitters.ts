// src/socket/socket.emitters.ts
import { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "./socket.event";

export const socketEmitters = (socket: Socket) => ({
  auth(commercialId: string, token: string) {
    socket.emit(SOCKET_EVENTS.AUTH.EMIT, { commercialId, token });
  },

  joinConversation(conversationId: string, commercialId: string) {
    socket.emit(SOCKET_EVENTS.CONVERSATION.JOIN, {
      conversationId,
      commercialId,
    });
  },

  sendMessage(payload: any) {
    socket.emit("agent:message", payload);
  },
});
