import { Injectable } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class AutoMessageOrchestrator {
  private locks = new Set<string>();
  private pendingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly messageAutoService: MessageAutoService,
    private readonly chatService: WhatsappChatService,
    private readonly logger: AppLogger,
  ) {}

  async handleClientMessage(chat: WhatsappChat) {
    const chatId = chat.chat_id;

    this.logger.debug(
      `Orchestrator step ${chat.auto_message_step} for ${chatId}`,
      AutoMessageOrchestrator.name,
    );

    const lastClient = chat.last_client_message_at;
    const lastAuto = chat.last_auto_message_sent_at;

    if (!lastClient) {
      return;
    }
    this.logger.debug(
      `Last auto message at ${chat.last_auto_message_sent_at}`,
      AutoMessageOrchestrator.name,
    );

    // 🔐 Idempotence DB
    // if (lastAuto && lastAuto >= lastClient) {
    //   return;
    // }
    this.logger.debug(
      `Poste ID ${chat.poste_id}`,
      AutoMessageOrchestrator.name,
    );

    // 🔐 Verrou mémoire (anti double webhook)
    if (this.locks.has(chatId)) {
      return;
    }
    this.logger.debug(
      `Lock check step ${chat.auto_message_step}`,
      AutoMessageOrchestrator.name,
    );

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
    this.logger.debug(
      `Scheduling auto message after ${delay}ms`,
      AutoMessageOrchestrator.name,
    );

    const timeout = setTimeout(() => {
      void this.executeAutoMessage(chatId)
        .catch((err) => {
          this.logger.error(
            'AutoMessage execution failed',
            err instanceof Error ? err.stack : undefined,
            AutoMessageOrchestrator.name,
          );
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
    this.logger.debug(
      `Rechecking chat ${chatId}`,
      AutoMessageOrchestrator.name,
    );

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
    this.logger.debug(
      `Next auto message step ${nextStep}`,
      AutoMessageOrchestrator.name,
    );

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
