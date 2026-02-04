import { Injectable } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class AutoMessageOrchestrator {
  private locks = new Set<string>();
  private pendingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly messageAutoService: MessageAutoService,
    private readonly chatService: WhatsappChatService,
  ) {}

  async handleClientMessage(chat: WhatsappChat) {
    const chatId = chat.chat_id;

    console.log('orchestrator step =', chat.auto_message_step);

    const lastClient = chat.last_client_message_at;
    const lastAuto = chat.last_auto_message_sent_at;

    if (!lastClient) {
      return;
    }
    console.log('orchestrator step =', chat.last_auto_message_sent_at);

    // 🔐 Idempotence DB
    // if (lastAuto && lastAuto >= lastClient) {
    //   return;
    // }
    console.log('orchestrator step =', chat.poste_id);

    // 🔐 Verrou mémoire (anti double webhook)
    if (this.locks.has(chatId)) {
      return;
    }
    console.log('orchestrator step =', chat.auto_message_step);


    // ❌ Stop si déjà terminé
    if (chat.auto_message_step >= 3) {
      if (!chat.read_only) {
        await this.chatService.update(chatId, { read_only: true });
      }
      return;
    }

    // ❌ Si agent a répondu
    // if (chat.last_poste_message_at) {
    //   return;
    // }

    // ❌ Déjà en attente réponse client
    // if (chat.waiting_client_reply) {
    //   return;
    // }

    // 🔒 Lock immédiat
    this.locks.add(chatId);

    // ⏱️ Délai humain random (20–45s)
    const delay = Math.floor(Math.random() * (45 - 20 + 1) + 20) * 10;
    console.log('orchestrator step =', delay);

    const timeout = setTimeout(() => {
      void this.executeAutoMessage(chatId)
        .catch((err) => {
          // log propre
          console.error('AutoMessage error', err);
        })
        .finally(() => {
          this.locks.delete(chatId);
          this.pendingTimeouts.delete(chatId);
        });
    }, delay);

    this.pendingTimeouts.set(chatId, timeout);
  }

  private async executeAutoMessage(chatId: string) {
    const freshChat = await this.chatService.findBychat_id(chatId);
    if (!freshChat) return;
    console.log('orchestrator step =', chatId);

    // 🔐 Recheck DB (double sécurité)
    const lastClient = freshChat.last_client_message_at;
    const lastAuto = freshChat.last_auto_message_sent_at;

    // ❌ Toujours aucune interaction client
    if (!lastClient) {
      return;
    }

    // // 🔐 Double sécurité DB
    // if (lastAuto && lastAuto >= lastClient) {
    //   return;
    // }

    const nextStep = freshChat.auto_message_step + 1;
    console.log('orchestrator step =', nextStep);

    // 🚀 Envoi réel
    await this.messageAutoService.sendAutoMessage(chatId, nextStep);

    // 🔒 Verrou définitif DB
    await this.chatService.update(chatId, {
      auto_message_step: nextStep,
      waiting_client_reply: true,
      last_auto_message_sent_at: new Date(),
    });
  }
}
