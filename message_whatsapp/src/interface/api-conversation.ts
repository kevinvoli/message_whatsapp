import { ApiMedia } from "./api-media";
import { ApiMessage } from "./api-message";

export interface ApiConversation {
  id: string;           // WhatsappChat.id
  chat_id: string;      // WhatsappChat.chat_id

  poste_id?: string | null;
  poste?: {
    id: string;
    name: string;
    code: string;
  };

  name: string;
  client_phone: string;

  status: "actif" | "en attente" | "fermé";

  unread_count: number;

  last_message?: ApiMessage | "[Media]" | null;
  messages?: ApiMessage[];
  medias?: ApiMedia[];

  last_client_message_at?: string | null;
  last_poste_message_at?: string | null;

  created_at: string;
  updated_at: string;
}
