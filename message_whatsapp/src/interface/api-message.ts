import { ApiMedia } from "./api-media";

export interface ApiMessage {
  id: string;                 // WhatsappMessage.id (UUID)
  message_id?: string | null; // WhatsappMessage.message_id (whapi id)

  chat_id: string;
  channel_id: string;

  text?: string | null;
  type: string;               // text | image | voice | ...

  from: string;               // numéro WhatsApp
  from_name?: string;
  from_me: boolean;

  direction: "IN" | "OUT";
  status?: "pending" | "sent" | "delivered" | "read" | "failed";

  poste_id?: string | null;
  commercial_id?: string | null; // 🔴 À AJOUTER si possible côté back

  timestamp: number;          // UNIX timestamp (source de vérité)

  voice?: {
    url: string;
    duration_seconds?: number;
  };

  medias?: ApiMedia[];
}
