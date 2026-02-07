import { MessageDirection } from "src/whatsapp_message/entities/whatsapp_message.entity";
import { WhatsappCommercial } from "./entities/user.entity";
import { WhatsappChatStatus } from "src/whatsapp_chat/entities/whatsapp_chat.entity";

export class CommercialMetricsService {
  calculateProductivite(user: WhatsappCommercial) {
    const messagesEnvoyes = user.messages.filter(m => m.direction === MessageDirection.OUT).length;
    const messagesRecus = user.messages.filter(m => m.direction === MessageDirection.IN).length;
    const chatsActifs = user.poste?.chats?.filter(c => c.status === WhatsappChatStatus.ACTIF).length || 0;

    return messagesEnvoyes + chatsActifs * 2 - messagesRecus * 0.5;
  }

  calculateProgression(user: WhatsappCommercial, days: number = 7) {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - days);

    const messagesInPeriod = user.messages.filter(
      m => m.timestamp >= start && m.timestamp <= now,
    ).length;

    return messagesInPeriod;
  }
}
