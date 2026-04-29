import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';
import { ChannelService } from 'src/channel/channel.service';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly chatDispatchLocks = new Map<string, Mutex>();
  /** S3 — mutex léger pour éviter l'overlap du cron SLA */
  private isSlaRunning = false;
  private getChatDispatchLock(chatId: string): Mutex {
    let mutex = this.chatDispatchLocks.get(chatId);
    if (!mutex) {
      mutex = new Mutex();
      this.chatDispatchLocks.set(chatId, mutex);
    }
    return mutex;
  }
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,

    private readonly queueService: QueueService,

    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    private readonly whatsappCommercialService: WhatsappCommercialService,

    private readonly notificationService: NotificationService,

    private readonly channelService: ChannelService,
  ) {}

  /**
   * 🎯 Décide si un message peut être assigné à un agent
   * ❌ N’émet PAS de socket
   * ❌ Ne sauvegarde PAS le message WhatsApp
   */

  async assignConversation(
    clientPhone: string,
    clientName: string,
    traceId?: string,
    tenantId?: string,
    channelId?: string,
  ): Promise<WhatsappChat | null> {
    const lock = this.getChatDispatchLock(clientPhone);
    try {
      return await lock.runExclusive(() =>
        this.assignConversationInternal(clientPhone, clientName, traceId, tenantId, channelId),
      );
    } finally {
      if (!lock.isLocked()) {
        this.chatDispatchLocks.delete(clientPhone);
      }
    }
  }

  /**
   * Résout le prochain poste selon la priorité :
   * 1. Poste dédié au channel (si défini) — même offline → EN_ATTENTE sur ce poste
   * 2. Queue globale (si channel non assigné à un poste)
   * Retourne null si aucun poste disponible (mode pool uniquement).
   */
  private async resolvePosteForChannel(channelId?: string): Promise<WhatsappPoste | null> {
    if (channelId) {
      const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        const poste = await this.posteRepository.findOne({ where: { id: dedicatedPosteId } });
        if (poste) {
          this.logger.log(`Channel "${channelId}" → poste dédié "${poste.name}" (mode dédié)`);
          return poste;
        }
        // Poste dédié introuvable (supprimé sans cascade) → fallback pool
        this.logger.warn(
          `Poste dédié "${dedicatedPosteId}" introuvable pour channel "${channelId}" — fallback queue globale`,
        );
      }
    }
    // Mode pool : queue globale
    return this.queueService.getNextInQueue();
  }

  private async assignConversationInternal(
    clientPhone: string,
    clientName: string,
    traceId?: string,
    tenantId?: string,
    channelId?: string,
  ): Promise<WhatsappChat | null> {
    if (traceId) {
      this.logger.log(`DISPATCH_START trace=${traceId} chat_id=${clientPhone}`);
    }

    const conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
      relations: ['messages', 'poste', 'channel'],
    });

    if (conversation?.read_only) {
      if (conversation.status === WhatsappChatStatus.FERME) {
        // Réouverture après fermeture manuelle : on lève le verrou et on laisse
        // le dispatch normal rouvrir et réassigner la conversation.
        this.logger.log(
          `DISPATCH_REOPEN trace=${traceId ?? '-'} chat_id=${conversation.chat_id} (fermeture manuelle levée)`,
        );
        conversation.read_only = false;
        // La suite du flux va mettre le bon statut (ACTIF ou EN_ATTENTE)
      } else {
        this.logger.warn(
          `Conversation read_only ignoree (${conversation.chat_id})`,
        );
        conversation.unread_count = (conversation.unread_count ?? 0) + 1;
        conversation.last_activity_at = new Date();
        await this.chatRepository.save(conversation);
        return conversation;
      }
    }

    // console.log("=========================== conversation", conversation);

    // Vérifier si le channel est dédié à un poste spécifique
    const dedicatedPosteId = channelId
      ? await this.channelService.getDedicatedPosteId(channelId)
      : null;

    // Déterminer si l’agent actuel est connecté ET sur le bon poste
    const currentPosteId = conversation?.poste?.id;
    const isOnDedicatedPoste =
      !dedicatedPosteId || currentPosteId === dedicatedPosteId;
    const isAgentConnected =
      currentPosteId && isOnDedicatedPoste
        ? this.messageGateway.isAgentConnected(currentPosteId)
        : false;

    /**
     * Cas 1️⃣ : conversation existante + agent connecté sur le bon poste
     * → juste mettre à jour l’activité et le compteur de messages non lus
     */
    if (conversation && isAgentConnected) {
      this.logger.debug(
        `Conversation existante avec agent connecte (${conversation.chat_id})`,
      );

      if (tenantId && !conversation.tenant_id) {
        conversation.tenant_id = tenantId;
      }
      // Mettre à jour le nom si un meilleur nom est disponible (ex: "Client" → vrai nom résolu)
      if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
        conversation.name = clientName;
      }
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      if (
        !conversation.first_response_deadline_at &&
        !conversation.last_poste_message_at
      ) {
        conversation.first_response_deadline_at = new Date(
          Date.now() + 5 * 60 * 1000,
        );
      }
      if (conversation.status === WhatsappChatStatus.FERME) {
        conversation.status = WhatsappChatStatus.ACTIF;
      }
      if (!conversation.poste) {
        this.logger.warn(
          `📩 Conversation ${conversation.chat_id} sans commercial (réinjection ou offline)`,
        );
      }
      this.logger.log(
        `📩 Conversation (${conversation.chat_id}) assignée à ${conversation?.poste?.name ?? 'NON ASSIGNE'}`,
      );
      const saved = await this.chatRepository.save(conversation);
      await this.messageGateway.emitConversationUpsertByChatId(
        saved.chat_id,
      );
      return saved;
    }

    const nextAgent = await this.resolvePosteForChannel(channelId);
    // Aucun agent disponible → message en attente
    if (!nextAgent) {
      this.logger.warn(`⏳ Aucun agent disponible, message en attente pour `);
      const displayName = clientName || clientPhone.split('@')[0];
      void this.notificationService.create(
        'queue',
        `Conversation en attente — ${displayName}`,
        `Aucun agent disponible. La conversation de ${displayName} est placée en file d'attente.`,
      );
      if (conversation) {
        if (tenantId && !conversation.tenant_id) {
          conversation.tenant_id = tenantId;
        }
        if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
          conversation.name = clientName;
        }
        // Ne pas effacer le poste_id si la conversation était déjà assignée :
        // un poste hors ligne ou une queue vide n'est pas une raison de couper le lien.
        // Le poste est conservé — la conversation reste EN_ATTENTE sur lui.
        if (!conversation.poste_id) {
          conversation.poste = null;
          conversation.assigned_at = null;
          conversation.assigned_mode = null;
        } else {
          conversation.assigned_mode = 'OFFLINE';
        }
        conversation.status = WhatsappChatStatus.EN_ATTENTE;
        conversation.unread_count += 1;
        conversation.last_activity_at = new Date();
        conversation.first_response_deadline_at = null;
        conversation.last_client_message_at = new Date();
        return this.chatRepository.save(conversation);
      }

      const waitingChat = this.chatRepository.create({
        chat_id: clientPhone,
        name: clientName,
        tenant_id: tenantId ?? null,
        type: 'private',
        contact_client: clientPhone.split('@')[0],
        poste: null,
        poste_id: null,
        status: WhatsappChatStatus.EN_ATTENTE,
        unread_count: 1,
        last_activity_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        assigned_at: null,
        assigned_mode: null,
        first_response_deadline_at: null,
        last_client_message_at: new Date(),
      });

      this.logger.log(
        `🆕 Creation conversation en attente (sans agent) pour ${clientPhone}`,
      );
      return this.chatRepository.save(waitingChat);
    }

    /**
     * Cas 3️⃣ : conversation existante mais poste absent ou réassignation
     */
    // console.log('conversation :', conversation);

    if (conversation) {
      this.logger.log(
        `🔁 Réassignation conversation (${conversation.chat_id}) de l'agent (${'aucun'}) à (${nextAgent.name})`,
      );
      if (tenantId && !conversation.tenant_id) {
        conversation.tenant_id = tenantId;
      }
      if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
        conversation.name = clientName;
      }
      conversation.poste = nextAgent;
      conversation.poste_id = nextAgent.id;
      conversation.status = nextAgent.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE;
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      conversation.assigned_at = new Date();
      conversation.assigned_mode = nextAgent.is_active ? 'ONLINE' : 'OFFLINE';
      conversation.first_response_deadline_at = new Date(
        Date.now() + 5 * 60 * 1000,
      );

      conversation.last_client_message_at = new Date();
      const saved = await this.chatRepository.save(conversation);
      void this.notificationService.create(
        'info',
        `Conversation réassignée — ${saved.name || saved.chat_id}`,
        `La conversation de ${saved.name || saved.contact_client} a été assignée au poste ${nextAgent.name}.`,
      );
      await this.messageGateway.emitConversationUpsertByChatId(
        saved.chat_id,
      );
      return saved;
    }

    /**
     * Cas 4️⃣ : nouvelle conversation
     */
    this.logger.log(
      `🆕 Création nouvelle conversation pour ${clientPhone} avec agent (${nextAgent.name})`,
    );

    const newChat = this.chatRepository.create({
      chat_id: clientPhone,
      name: clientName,
      tenant_id: tenantId ?? null,
      type: 'private',
      contact_client: clientPhone.split('@')[0],
      poste: nextAgent,
      poste_id: nextAgent.id,
      status: nextAgent.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      unread_count: 1,
      last_activity_at: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      assigned_at: new Date(),
      assigned_mode: nextAgent.is_active ? 'ONLINE' : 'OFFLINE',
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),

      last_client_message_at: new Date(),
    });

    this.logger.debug(`Nouvelle conversation creee (${newChat.chat_id})`);

    const saved = await this.chatRepository.save(newChat);
    void this.notificationService.create(
      'info',
      `Nouvelle conversation — ${clientName || clientPhone.split('@')[0]}`,
      `Nouvelle conversation de ${clientName || clientPhone.split('@')[0]} assignée au poste ${nextAgent.name}.`,
    );
    await this.messageGateway.emitConversationAssigned(saved.chat_id);
    return saved;
  }

  async reinjectConversation(
    chat: WhatsappChat,
    skipEmit = false,
  ): Promise<{ oldPosteId: string; newPosteId: string } | null> {
    if (chat.read_only) {
      this.logger.warn(
        `Reinjection ignoree: conversation read_only (${chat.chat_id})`,
      );
      return null;
    }

    // Channel dédié : ne jamais réinjecter dans la queue globale.
    // La conversation doit rester sur le poste dédié — on renouvelle juste la deadline.
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id;
    if (channelId) {
      const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        this.logger.debug(
          `Reinject ignoré (${chat.chat_id}): channel dédié au poste ${dedicatedPosteId} — deadline étendue`,
        );
        await this.chatRepository.update(chat.id, {
          first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
        });
        return null;
      }
    }

    // Si le poste actuel est le seul dans la queue, un redispatch lui
    // renverrait la conversation immédiatement — sans aucun bénéfice.
    // On renouvelle simplement la deadline pour éviter que le job ne
    // se déclenche en boucle, et on attend qu'un autre poste se connecte.
    if (chat.poste_id) {
      const alternatives =
        await this.queueService.countQueuedPostesExcluding(chat.poste_id);
      if (alternatives === 0) {
        this.logger.debug(
          `Redispatch ignoré (${chat.chat_id}): le poste (${chat.poste_id}) est le seul dans la queue`,
        );
        await this.chatRepository.update(chat.id, {
          first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
        });
        return null;
      }
    }

    // ─── Approche atomique : trouver le prochain poste AVANT d'effacer l'actuel ──
    const oldPosteId = chat.poste_id ?? null;

    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      this.logger.warn(
        `Réinjection impossible (${chat.chat_id}): aucun poste alternatif — deadline étendue +30 min`,
      );
      await this.chatRepository.update(chat.id, {
        first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
      });
      return null;
    }

    // Un seul UPDATE atomique — poste_id ne passe JAMAIS par NULL
    // S5 — deadline 30 min (alignée sur l'intervalle minimum cron × 3)
    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    void this.notificationService.create(
      'alert',
      `SLA dépassé — ${chat.name || chat.chat_id}`,
      `La conversation de ${chat.name || chat.contact_client || chat.chat_id.split('@')[0]} a été réassignée au poste ${nextPoste.name}.`,
    );

    // S1 — skipEmit : l'appelant batche les émissions lui-même
    if (skipEmit) {
      return { oldPosteId: oldPosteId ?? '', newPosteId: nextPoste.id };
    }

    await this.messageGateway.emitConversationReassigned(
      { ...chat, poste_id: nextPoste.id, poste: nextPoste } as WhatsappChat,
      oldPosteId ?? '',
      nextPoste.id,
    );
    return { oldPosteId: oldPosteId ?? '', newPosteId: nextPoste.id };
  }

  /**
   * Dispatche une conversation orpheline (poste_id = null, status = en_attente).
   * Trouve le prochain poste dans la queue et émet CONVERSATION_ASSIGNED.
   */
  async dispatchOrphanConversation(chat: WhatsappChat): Promise<void> {
    if (chat.read_only) {
      this.logger.warn(`Dispatch orphelin ignoré: conversation read_only (${chat.chat_id})`);
      return;
    }

    // Canal dédié : toujours router vers le poste dédié, jamais vers la queue globale.
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id;
    if (channelId) {
      const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        const dedicatedPoste = await this.posteRepository.findOne({ where: { id: dedicatedPosteId } });
        if (dedicatedPoste) {
          await this.chatRepository.update(chat.id, {
            poste: dedicatedPoste,
            poste_id: dedicatedPoste.id,
            assigned_mode: dedicatedPoste.is_active ? 'ONLINE' : 'OFFLINE',
            status: dedicatedPoste.is_active
              ? WhatsappChatStatus.ACTIF
              : WhatsappChatStatus.EN_ATTENTE,
            assigned_at: new Date(),
            first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
          });
          await this.messageGateway.emitConversationAssigned(chat.chat_id);
          this.logger.log(`Orphelin dédié dispatché (${chat.chat_id}) → poste dédié ${dedicatedPoste.name}`);
          return;
        }
        // Poste dédié introuvable (supprimé sans cascade) → fallback queue globale
        this.logger.warn(`Poste dédié "${dedicatedPosteId}" introuvable pour orphelin (${chat.chat_id}) — fallback queue globale`);
      }
    }

    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      this.logger.warn(`⏳ Aucun agent disponible pour orphelin (${chat.chat_id}), reste EN_ATTENTE`);
      return;
    }

    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    await this.messageGateway.emitConversationAssigned(chat.chat_id);
    this.logger.log(`Orphelin dispatché (${chat.chat_id}) → poste ${nextPoste.id}`);
  }

  async dispatchExistingConversation(chat: WhatsappChat) {
    const oldPoste = chat.poste_id;
    if (chat.read_only) {
      this.logger.warn(
        `Dispatch ignore: conversation read_only (${chat.chat_id})`,
      );
      return;
    }
    if (!oldPoste) {
      return;
    }
    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      // Aucun agent disponible : notifier l'ancien poste que la conversation
      // passe en attente, sinon elle reste visible comme fantôme sur son interface.
      this.logger.warn(
        `⏳ Aucun agent disponible pour réinjecter (${chat.chat_id}), passage EN_ATTENTE`,
      );
      await this.messageGateway.emitConversationRemoved(chat.chat_id, oldPoste);
      return;
    }

    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      // 15 min au lieu de 5 min — évite que toutes les conversations non répondues
      // reviennent dans le SLA checker à chaque cycle de 5 min (boucle de charge infinie)
      first_response_deadline_at: new Date(Date.now() + 15 * 60 * 1000),
    });

    const updatedChat = await this.chatRepository.findOne({
      where: { chat_id: chat.chat_id },
      relations: ['poste'],  // 'messages' retiré — inutile ici et charge tous les messages en RAM
    });

    if (!updatedChat) {
      return;
    }
    // Notification unique lors d'une réassignation SLA effective
    void this.notificationService.create(
      'alert',
      `SLA dépassé — ${updatedChat.name || updatedChat.chat_id}`,
      `La conversation de ${updatedChat.name || updatedChat.contact_client || updatedChat.chat_id.split('@')[0]} n'a pas reçu de réponse dans les délais. Réassignée au poste ${nextPoste.name}.`,
    );

    // 🔥 EVENT CENTRAL
    await this.messageGateway.emitConversationReassigned(
      updatedChat,
      oldPoste,
      nextPoste.id,
    );
  }

  async jobRunnertcheque(poste_id: string) {
    const now = new Date();

    const chats = await this.chatRepository.find({
      where: {
        poste_id: poste_id,
        status: WhatsappChatStatus.ACTIF,
        unread_count: MoreThan(0),
      },
    });
    this.logger.debug(
      `Verification SLA reponses (${poste_id}) - ${chats.length} conversations`,
    );

    for (const chat of chats) {
      await this.reinjectConversation(chat);
    }
  }

  /**
   * Réinjecte dans la file d'attente les conversations non lues depuis plus de
   * thresholdMinutes — exactement comme un nouveau message entrant.
   * Chaque conversation passe par getNextInQueue() pour être assignée au prochain
   * poste disponible dans la queue, sans logique d'équilibrage manuel.
   */
  async jobRunnerAllPostes(thresholdMinutes = 15, batchSize = 300): Promise<string> {
    if (this.isSlaRunning) {
      this.logger.warn('SLA checker déjà en cours — cycle ignoré');
      return 'Ignoré — cycle précédent encore en cours';
    }
    this.isSlaRunning = true;

    try {
      const threshold = new Date(Date.now() - thresholdMinutes * 60_000);

      const chats = await this.chatRepository
        .createQueryBuilder('chat')
        .where('chat.status IN (:...statuses)', {
          statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
        })
        .andWhere('chat.unread_count > 0')
        .andWhere('chat.last_client_message_at < :threshold', { threshold })
        .andWhere('chat.read_only = :readOnly', { readOnly: false })
        .andWhere('chat.poste_id IS NOT NULL')
        .andWhere('chat.deletedAt IS NULL')
        .orderBy('chat.last_client_message_at', 'ASC')
        .take(batchSize)
        .getMany();

      if (chats.length === 0) {
        return 'Aucune conversation éligible';
      }

      this.logger.log(`SLA checker : ${chats.length} conversation(s) à réinjecter dans la queue`);

      const reassignments: Array<{ chatId: string; oldPosteId: string; newPosteId: string }> = [];
      let reinjected = 0;

      for (const chat of chats) {
        try {
          const result = await this.reinjectConversation(chat, true);
          if (result) {
            reassignments.push({ chatId: chat.chat_id, ...result });
            reinjected++;
          }
        } catch (err) {
          this.logger.warn(`SLA reinject error (chat ${chat.id}): ${String(err)}`);
        }
      }

      if (reassignments.length > 0) {
        await this.messageGateway.emitBatchReassignments(reassignments);
      }

      return `${reinjected} conversation(s) réinjectée(s) sur ${chats.length} ciblée(s)`;
    } finally {
      this.isSlaRunning = false;
    }
  }

  async redispatchWaiting(): Promise<{ dispatched: number; still_waiting: number }> {
    const waitingChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE },
      relations: ['poste'],
    });

    let dispatched = 0;
    let stillWaiting = 0;

    for (const chat of waitingChats) {
      // Ignorer les conversations verrouillées (en attente de réaction client)
      if (chat.read_only) { stillWaiting++; continue; }

      // Ignorer les conversations sur canal dédié — elles ne doivent pas quitter leur poste
      const dedicatedPosteId = chat.channel_id
        ? await this.channelService.getDedicatedPosteId(chat.channel_id)
        : null;
      if (dedicatedPosteId) { stillWaiting++; continue; }

      const lock = this.getChatDispatchLock(chat.chat_id);
      const assigned = await lock.runExclusive(async () => {
        const nextAgent = await this.queueService.getNextInQueue();
        if (!nextAgent) return false;

        const oldPosteId = chat.poste_id;

        await this.chatRepository.update(chat.id, {
          poste: nextAgent,
          poste_id: nextAgent.id,
          status: nextAgent.is_active
            ? WhatsappChatStatus.ACTIF
            : WhatsappChatStatus.EN_ATTENTE,
          assigned_at: new Date(),
          assigned_mode: nextAgent.is_active ? 'ONLINE' : 'OFFLINE',
          first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
        });

        // Notifier l'ancien poste si la conversation lui était déjà assignée
        if (oldPosteId && oldPosteId !== nextAgent.id) {
          await this.messageGateway.emitConversationRemoved(chat.chat_id, oldPosteId);
        }

        await this.messageGateway.emitConversationAssigned(chat.chat_id);
        void this.notificationService.create(
          'info',
          `Conversation assignée (manuel) — ${chat.name || chat.chat_id}`,
          `Assignée au poste ${nextAgent.name}.`,
        );
        return true;
      });

      if (assigned) {
        dispatched++;
      } else {
        // Queue vide pour cette conversation — continuer quand même les suivantes
        stillWaiting++;
      }

      if (!lock.isLocked()) {
        this.chatDispatchLocks.delete(chat.chat_id);
      }
    }

    this.logger.log(
      `Redispatch manuel: ${dispatched} assignée(s), ${stillWaiting} toujours en attente`,
    );
    return { dispatched, still_waiting: stillWaiting };
  }

  /**
   * Réinitialise les conversations ACTIF dont l'agent est hors ligne (is_active = false)
   * vers EN_ATTENTE, sans les réassigner immédiatement.
   * Les agents les récupèrent naturellement en se connectant via le dispatch normal.
   */
  async resetStuckActiveToWaiting(): Promise<{ reset: number }> {
    const activeChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.ACTIF, read_only: false },
      relations: ['poste'],
    });

    const stuck = activeChats.filter((c) => !c.poste || !c.poste.is_active);

    if (stuck.length === 0) {
      return { reset: 0 };
    }

    // Un poste hors ligne n'est pas une raison de couper l'assignation.
    // On passe juste le statut en EN_ATTENTE — le poste_id est conservé.
    // Quand le poste se reconnecte, la conversation est déjà visible dans sa file.
    const ids = stuck.map((c) => c.id);
    await this.chatRepository
      .createQueryBuilder()
      .update()
      .set({
        status: WhatsappChatStatus.EN_ATTENTE,
        assigned_mode: 'OFFLINE',
        first_response_deadline_at: null,
      })
      .whereInIds(ids)
      .execute();

    this.logger.log(
      `resetStuckActiveToWaiting: ${stuck.length} conversation(s) → EN_ATTENTE (poste_id conservé)`,
    );
    return { reset: stuck.length };
  }

  async getDispatchSnapshot(): Promise<{
    queue_size: number;
    waiting_count: number;
    stuck_active_count: number;
    waiting_items: WhatsappChat[];
  }> {
    const queue = await this.queueService.getQueuePositions();
    const waitingChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE },
      relations: ['poste'],
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    const activeChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.ACTIF, read_only: false },
      relations: ['poste'],
    });
    const stuckActiveCount = activeChats.filter((c) => !c.poste || !c.poste.is_active).length;

    return {
      queue_size: queue.length,
      waiting_count: waitingChats.length,
      stuck_active_count: stuckActiveCount,
      waiting_items: waitingChats,
    };
  }

}
