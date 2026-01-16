// src/socket/socket.events.ts
export const SOCKET_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",

  AUTH: {
    EMIT: "auth",
    SUCCESS: "auth:success",
  },

  CONVERSATION: {
    LIST: "conversation:list",
    JOIN: "join:conversation",
    LEAVE: "leave:conversation",
  },

  MESSAGE: {
    GET: "get:messages",
    RECEIVED: "message:received",
    SENT: "message:sent",
  },
} as const;
