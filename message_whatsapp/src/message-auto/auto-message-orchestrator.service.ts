import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AppLogger } from 'src/logging/app-logger.service';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { AutoMessageScopeConfigService } from './auto-message-scope-config.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class AutoMessageOrchestrator {
  private locks = new Set<string>();
  private pendingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly messageAutoService: MessageAutoService,
    private readonly chatService: WhatsappChatService,
    private readonly cronConfigService: CronConfigService,
    private readonly scopeConfigService: AutoMessageScopeConfigService,
    private readonly logger: AppLogger,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly gateway: WhatsappMessageGateway,
    private readonly notificationService: NotificationService,
  ) {}

  async handleClientMessage(chat: WhatsappChat): Promise<void> {
    const chatId = chat.chat_id;

    this.logger.debug(
      `Orchestrator triggered — step=${chat.auto_message_step} chatId=${chatId}`,
      AutoMessageOrchestrator.name,
    );

    // Pas de message client enregistré → rien à faire
    if (!chat.last_client_message_at) {
      return;
    }

    // 🔐 Verrou mémoire (anti double-webhook)
    if (this.locks.has(chatId)) {
      this.logger.debug(
        `Lock already held for ${chatId}, skipping`,
        AutoMessageOrchestrator.name,
      );
      return;
    }

    // ⚙️ Activation globale
    const autoConfig = await this.cronConfigService.findByKey('auto-message');

    if (!autoConfig.enabled) {
      this.logger.debug(
        `Auto messages disabled globally`,
        AutoMessageOrchestrator.name,
      );
      return;
    }

    const maxSteps = autoConfig.maxSteps ?? 3;

    // ⚙️ Nombre max d'étapes atteint
    if (chat.auto_message_step >= maxSteps) {
      this.logger.debug(
        `Max steps reached (${chat.auto_message_step}/${maxSteps}) for ${chatId}`,
        AutoMessageOrchestrator.name,
      );
      if (!chat.read_only) {
        await this.chatService.update(chatId, { read_only: true });
      }
      void this.notificationService.create(
        'info',
        `Séquence auto terminée — ${chat.name || chatId}`,
        `La conversation de ${chat.name || chat.contact_client || chatId.split('@')[0]} a atteint l'étape maximale (${maxSteps}). En attente de réponse client.`,
      );
      return;
    }

    // 🔍 Activation par scope (poste / canal / provider)
    const scopeEnabled = await this.scopeConfigService.isEnabledFor(
      chat.poste_id,
      chat.last_msg_client_channel_id,
      chat.channel?.provider ?? null,
    );

    if (!scopeEnabled) {
      this.logger.debug(
        `Auto messages blocked by scope config for ${chatId}`,
        AutoMessageOrchestrator.name,
      );
      return;
    }

    // 🔐 Double-check du lock APRÈS les awaits (anti race condition)
    // Deux webhooks simultanés peuvent tous les deux passer le premier check
    // si les awaits ci-dessus libèrent l'event loop entre les deux appels.
    if (this.locks.has(chatId)) {
      this.logger.debug(
        `Lock acquired by concurrent call during async checks, skipping ${chatId}`,
        AutoMessageOrchestrator.name,
      );
      return;
    }

    // 🔒 Lock immédiat avant le setTimeout
    this.locks.add(chatId);

    // 🚫 Verrouillage immédiat de la conversation côté commercial
    // Le commercial ne peut pas envoyer de message pendant le délai d'attente.
    await this.chatService.update(chatId, { read_only: true });
    this.gateway.emitConversationReadonly({ ...chat, read_only: true } as WhatsappChat);

    this.logger.debug(
      `Conversation ${chatId} locked for auto-message scheduling`,
      AutoMessageOrchestrator.name,
    );

    // ⏱️ Calcul du délai — dans un try/catch pour libérer le lock si erreur DB
    try {
      const nextStep = chat.auto_message_step + 1;
      const nextMessage = await this.messageAutoService.getAutoMessageByPosition(nextStep);

      const delaySeconds =
        nextMessage?.delai && nextMessage.delai > 0
          ? nextMessage.delai
          : this.randomBetween(
              autoConfig.delayMinSeconds ?? 20,
              autoConfig.delayMaxSeconds ?? 45,
            );

      const delayMs = delaySeconds * 1000;

      this.logger.debug(
        `Scheduling step ${nextStep} after ${delaySeconds}s for ${chatId}`,
        AutoMessageOrchestrator.name,
      );

      const timeout = setTimeout(() => {
        void this.executeAutoMessage(chatId)
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            this.logger.error(
              `AutoMessage execution failed for ${chatId}: ${msg}`,
              stack,
              AutoMessageOrchestrator.name,
            );
          })
          .finally(() => {
            this.locks.delete(chatId);
            this.pendingTimeouts.delete(chatId);
          });
      }, delayMs);

      this.pendingTimeouts.set(chatId, timeout);
    } catch (err) {
      // Libérer le lock et déverrouiller la conversation si le scheduling échoue
      this.locks.delete(chatId);
      await this.chatService.update(chatId, { read_only: false });
      this.gateway.emitConversationReadonly({ ...chat, read_only: false } as WhatsappChat);

      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `AutoMessage scheduling failed for ${chatId}: ${msg}`,
        stack,
        AutoMessageOrchestrator.name,
      );
    }
  }

  private async executeAutoMessage(chatId: string): Promise<void> {

    const freshChat = await this.chatService.findBychat_id(chatId);

    if (!freshChat) return;

    this.logger.debug(
      `Executing auto message for ${chatId}`,
      AutoMessageOrchestrator.name,
    );

    const lastClient = freshChat.last_client_message_at;
    const lastAuto = freshChat.last_auto_message_sent_at;

    // Pas de message client → rien à envoyer
    if (!lastClient) {
      return;
    }

    // 🔐 Double sécurité DB : un auto-message a déjà été envoyé après le dernier message client
    if (lastAuto && lastAuto >= lastClient) {
      this.logger.debug(
        `Auto message already sent after last client message, skipping ${chatId}`,
        AutoMessageOrchestrator.name,
      );
      return;
    }

    const nextStep = freshChat.auto_message_step + 1;
    this.logger.debug(
      `Sending auto message step ${nextStep} for ${chatId}`,
      AutoMessageOrchestrator.name,
    );

    // 🚀 Envoi réel (sendAutoMessage gère le typing WA + déverrouillage frontend)
    await this.messageAutoService.sendAutoMessage(chatId, nextStep);

    // 🔒 Mise à jour BDD post-envoi
    await this.chatService.update(chatId, {
      auto_message_step: nextStep,
      waiting_client_reply: true,
      last_auto_message_sent_at: new Date(),
    });
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
}
