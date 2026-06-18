import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';
import { ChannelService } from 'src/channel/channel.service';
import {
  MessageDirection,
  WhatsappMessage,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly chatDispatchLocks = new Map<string, Mutex>();
  /** S3 — mutex leger pour eviter l'overlap du cron SLA */
  private isSlaRunning = false;
  private slaRunningStartedAt: Date | null = null;
  private readonly SLA_STALE_TIMEOUT_MS = 30 * 60 * 1000;
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

    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,

    private readonly queueService: QueueService,

    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    private readonly whatsappCommercialService: WhatsappCommercialService,

    private readonly notificationService: NotificationService,

    private readonly channelService: ChannelService,
  ) {}

  /**
   * Retourne le poste_id du commercial le plus recent ayant lu un message IN
   * dans ce chat et etant encore connecte (isConnected = true).
   * Retourne null si aucun lecteur en ligne n'est trouve.
   */
  private async findOnlineReaderPosteId(chatId: string): Promise<string | null> {
    const joinCondition = [
      'm.readByCommercialId = c.id',
      'm.chat_id = :chatId',
      'm.direction = :dir',
      'm.readByCommercialAt IS NOT NULL',
    ].join(' AND ');

    const row = await this.commercialRepository
      .createQueryBuilder('c')
      .innerJoin(WhatsappMessage, 'm', joinCondition, {
        chatId,
        dir: MessageDirection.IN,
      })
      .select('c.id', 'id')
      .addSelect('c.poste_id', 'poste_id')
      .where('c.isConnected = :connected', { connected: true })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('m.readByCommercialAt', 'DESC')
      .limit(1)
      .getRawOne<{ id: string; poste_id: string | null }>();

    return row?.poste_id ?? null;
  }

  /**
   * Decide si un message peut etre assigne a un agent
   * N'emet PAS de socket
   * Ne sauvegarde PAS le message WhatsApp
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
   * Resout le prochain poste selon la priorite :
   * 1. Poste dedie au channel (si defini) — meme offline -> EN_ATTENTE sur ce poste
   * 2. Queue globale (si channel non assigne a un poste)
   * Retourne null si aucun poste disponible (mode pool uniquement).
   */
  private async resolvePosteForChannel(channelId?: string): Promise<WhatsappPoste | null> {
    if (channelId) {
      const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        const poste = await this.posteRepository.findOne({ where: { id: dedicatedPosteId } });
        if (poste) {
          this.logger.log(`Channel "${channelId}" -> poste dedie "${poste.name}" (mode dedie)`);
          return poste;
        }
        // Poste dedie introuvable (supprime sans cascade) -> fallback pool
        this.logger.warn(
          `Poste dedie "${dedicatedPosteId}" introuvable pour channel "${channelId}" — fallback queue globale`,
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
        // Reouverture apres fermeture manuelle : on leve le verrou et on laisse
        // le dispatch normal rouvrir et reassigner la conversation.
        this.logger.log(
          `DISPATCH_REOPEN trace=${traceId ?? '-'} chat_id=${conversation.chat_id} (fermeture manuelle levee)`,
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

    // Verifier si le channel est dedie a un poste specifique
    const dedicatedPosteId = channelId
      ? await this.channelService.getDedicatedPosteId(channelId)
      : null;

    // Determiner si l'agent actuel est connecte ET sur le bon poste
    const currentPosteId = conversation?.poste?.id;
    const isOnDedicatedPoste =
      !dedicatedPosteId || currentPosteId === dedicatedPosteId;
    const isAgentConnected =
      currentPosteId && isOnDedicatedPoste
        ? this.messageGateway.isAgentConnected(currentPosteId)
        : false;

    /**
     * Cas 1 : conversation existante + agent connecte sur le bon poste
     * -> juste mettre a jour l'activite et le compteur de messages non lus
     */
    if (conversation && isAgentConnected) {
      this.logger.debug(
        `Conversation existante avec agent connecte (${conversation.chat_id})`,
      );

      if (tenantId && !conversation.tenant_id) {
        conversation.tenant_id = tenantId;
      }
      // Mettre a jour le nom si un meilleur nom est disponible (ex: "Client" -> vrai nom resolu)
      if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
        conversation.name = clientName;
      }
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      conversation.last_client_message_at = new Date();
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
          `Conversation ${conversation.chat_id} sans commercial (reinjection ou offline)`,
        );
      }
      this.logger.log(
        `Conversation (${conversation.chat_id}) assignee a ${conversation?.poste?.name ?? 'NON ASSIGNE'}`,
      );
      const saved = await this.chatRepository.save(conversation);
      await this.messageGateway.emitConversationUpsertByChatId(
        saved.chat_id,
      );
      return saved;
    }

    const nextAgent = await this.resolvePosteForChannel(channelId);
    // Aucun agent disponible -> message en attente
    if (!nextAgent) {
      this.logger.warn(`Aucun agent disponible, message en attente pour `);
      const displayName = clientName || clientPhone.split('@')[0];
      void this.notificationService.create(
        'queue',
        `Conversation en attente — ${displayName}`,
        `Aucun agent disponible. La conversation de ${displayName} est placee en file d'attente.`,
      );
      if (conversation) {
        if (tenantId && !conversation.tenant_id) {
          conversation.tenant_id = tenantId;
        }
        if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
          conversation.name = clientName;
        }
        // Ne pas effacer le poste_id si la conversation etait deja assignee :
        // un poste hors ligne ou une queue vide n'est pas une raison de couper le lien.
        // Le poste est conserve — la conversation reste EN_ATTENTE sur lui.
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
        channel_id: channelId ?? undefined,
        last_msg_client_channel_id: channelId ?? undefined,
      });

      this.logger.log(
        `Creation conversation en attente (sans agent) pour ${clientPhone}`,
      );
      return this.chatRepository.save(waitingChat);
    }

    /**
     * Cas 3 : conversation existante mais poste absent ou reassignation
     */
    if (conversation) {
      // Read-lock : si un commercial a lu cette conversation et est encore connecte, ne pas reassigner
      const onlineReaderPosteId = await this.findOnlineReaderPosteId(clientPhone);
      if (onlineReaderPosteId && onlineReaderPosteId !== nextAgent.id) {
        const readerPoste = await this.posteRepository.findOne({ where: { id: onlineReaderPosteId } });
        if (readerPoste) {
          if (tenantId && !conversation.tenant_id) {
            conversation.tenant_id = tenantId;
          }
          if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
            conversation.name = clientName;
          }
          conversation.poste = readerPoste;
          conversation.poste_id = readerPoste.id;
          conversation.status = readerPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE;
          conversation.unread_count += 1;
          conversation.last_activity_at = new Date();
          conversation.last_client_message_at = new Date();
          conversation.assigned_at = new Date();
          conversation.assigned_mode = readerPoste.is_active ? 'ONLINE' : 'OFFLINE';
          this.logger.log(`Read-lock Cas3 (${conversation.chat_id}): conserve sur poste lecteur ${readerPoste.name}`);
          const saved = await this.chatRepository.save(conversation);
          await this.messageGateway.emitConversationUpsertByChatId(saved.chat_id);
          return saved;
        }
      }

      this.logger.log(
        `Reassignation conversation (${conversation.chat_id}) de l'agent (aucun) a (${nextAgent.name})`,
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
        `Conversation reassignee — ${saved.name || saved.chat_id}`,
        `La conversation de ${saved.name || saved.contact_client} a ete assignee au poste ${nextAgent.name}.`,
      );
      await this.messageGateway.emitConversationUpsertByChatId(
        saved.chat_id,
      );
      return saved;
    }

    /**
     * Cas 4 : nouvelle conversation
     */
    this.logger.log(
      `Creation nouvelle conversation pour ${clientPhone} avec agent (${nextAgent.name})`,
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
      channel_id: channelId ?? undefined,
      last_msg_client_channel_id: channelId ?? undefined,
    });

    this.logger.debug(`Nouvelle conversation creee (${newChat.chat_id})`);

    const saved = await this.chatRepository.save(newChat);
    void this.notificationService.create(
      'info',
      `Nouvelle conversation — ${clientName || clientPhone.split('@')[0]}`,
      `Nouvelle conversation de ${clientName || clientPhone.split('@')[0]} assignee au poste ${nextAgent.name}.`,
    );
    await this.messageGateway.emitConversationAssigned(saved.chat_id);
    return saved;
  }

  async reinjectConversation(
    chat: WhatsappChat,
    skipEmit = false,
  ): Promise<{ oldPosteId: string; newPosteId: string } | null> {
    if (chat.status === WhatsappChatStatus.FERME) {
      this.logger.debug(`Reinjection ignoree: conversation fermee (${chat.chat_id})`);
      return null;
    }

    if (chat.read_only) {
      this.logger.warn(
        `Reinjection ignoree: conversation read_only (${chat.chat_id})`,
      );
      return null;
    }

    // Conversation deja lue : ne jamais reinjecter ni changer de poste.
    if ((chat.unread_count ?? 0) === 0) {
      this.logger.debug(
        `Reinjection ignoree: conversation deja lue (unread_count=0) (${chat.chat_id})`,
      );
      return null;
    }

    // Channel dedie : ne jamais reinjecter dans la queue globale.
    // La conversation doit rester sur le poste dedie — on renouvelle juste la deadline.
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id;
    if (channelId) {
      const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        this.logger.debug(
          `Reinject ignore (${chat.chat_id}): channel dedie au poste ${dedicatedPosteId} — deadline etendue`,
        );
        await this.chatRepository.update(chat.id, {
          first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
        });
        return null;
      }
    }

    // Si le poste actuel est le seul dans la queue, un redispatch lui
    // renverrait la conversation immediatement — sans aucun benefice.
    // On renouvelle simplement la deadline pour eviter que le job ne
    // se declenche en boucle, et on attend qu'un autre poste se connecte.
    if (chat.poste_id) {
      const alternatives =
        await this.queueService.countQueuedPostesExcluding(chat.poste_id);
      if (alternatives === 0) {
        this.logger.debug(
          `Redispatch ignore (${chat.chat_id}): le poste (${chat.poste_id}) est le seul dans la queue`,
        );
        await this.chatRepository.update(chat.id, {
          first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
        });
        return null;
      }
    }

    // Read-lock : si un commercial qui a lu cette conversation est encore connecte,
    // on ne reassigne pas — on etend juste la deadline pour qu'il puisse repondre.
    const onlineReaderPosteId = await this.findOnlineReaderPosteId(chat.chat_id);
    if (onlineReaderPosteId) {
      this.logger.debug(
        `Reinject bloque (${chat.chat_id}): commercial lecteur encore connecte (poste ${onlineReaderPosteId})`,
      );
      await this.chatRepository.update(chat.id, {
        first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
      });
      return null;
    }

    // Approche atomique : trouver le prochain poste AVANT d'effacer l'actuel
    const oldPosteId = chat.poste_id ?? null;

    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      this.logger.warn(
        `Reinjection impossible (${chat.chat_id}): aucun poste alternatif — deadline etendue +30 min`,
      );
      await this.chatRepository.update(chat.id, {
        first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
      });
      return null;
    }

    // Un seul UPDATE atomique — poste_id ne passe JAMAIS par NULL
    // S5 — deadline 30 min (alignee sur l'intervalle minimum cron x 3)
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
      `SLA depasse — ${chat.name || chat.chat_id}`,
      `La conversation de ${chat.name || chat.contact_client || chat.chat_id.split('@')[0]} a ete reassignee au poste ${nextPoste.name}.`,
    );

    // S1 — skipEmit : l'appelant batche les emissions lui-meme
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
   * Trouve le prochain poste dans la queue et emet CONVERSATION_ASSIGNED.
   */
  async dispatchOrphanConversation(chat: WhatsappChat): Promise<void> {
    if (chat.status === WhatsappChatStatus.FERME) {
      this.logger.debug(`Dispatch orphelin ignore: conversation fermee (${chat.chat_id})`);
      return;
    }

    if (chat.read_only) {
      this.logger.warn(`Dispatch orphelin ignore: conversation read_only (${chat.chat_id})`);
      return;
    }

    // Canal dedie : toujours router vers le poste dedie, jamais vers la queue globale.
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id;
    if (channelId) {
      const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        const dedicatedPoste = await this.posteRepository.findOne({ where: { id: dedicatedPosteId } });
        if (dedicatedPoste) {
          // R2 — WHERE poste_id IS NULL : atomique, evite la double assignation si un
          // webhook a deja dispatche la conversation entre la lecture et cet update.
          const dedicatedResult = await this.chatRepository.createQueryBuilder()
            .update(WhatsappChat)
            .set({
              poste_id: dedicatedPoste.id,
              assigned_mode: dedicatedPoste.is_active ? 'ONLINE' : 'OFFLINE',
              status: dedicatedPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
              assigned_at: new Date(),
              first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
            })
            .where('id = :id AND poste_id IS NULL', { id: chat.id })
            .execute();
          if (!dedicatedResult.affected) {
            this.logger.debug(`Orphelin dedie ignore (${chat.chat_id}): poste_id deja assigne entre-temps`);
            return;
          }
          await this.messageGateway.emitConversationAssigned(chat.chat_id);
          this.logger.log(`Orphelin dedie dispatche (${chat.chat_id}) -> poste dedie ${dedicatedPoste.name}`);
          return;
        }
        // Poste dedie introuvable (supprime sans cascade) -> fallback queue globale
        this.logger.warn(`Poste dedie "${dedicatedPosteId}" introuvable pour orphelin (${chat.chat_id}) — fallback queue globale`);
      }
    }

    // Read-lock : un commercial a lu cette conversation et est encore connecte -> assigner a son poste
    const onlineReaderPosteId = await this.findOnlineReaderPosteId(chat.chat_id);
    if (onlineReaderPosteId) {
      const readerPoste = await this.posteRepository.findOne({ where: { id: onlineReaderPosteId } });
      if (readerPoste) {
        const lockResult = await this.chatRepository.createQueryBuilder()
          .update(WhatsappChat)
          .set({
            poste_id: readerPoste.id,
            assigned_mode: readerPoste.is_active ? 'ONLINE' : 'OFFLINE',
            status: readerPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
            assigned_at: new Date(),
            first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
          })
          .where('id = :id AND poste_id IS NULL', { id: chat.id })
          .execute();
        if (lockResult.affected) {
          await this.messageGateway.emitConversationAssigned(chat.chat_id);
          this.logger.log(`Orphelin read-lock (${chat.chat_id}) -> poste lecteur ${readerPoste.name}`);
        }
        return;
      }
    }

    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      this.logger.warn(`Aucun agent disponible pour orphelin (${chat.chat_id}), reste EN_ATTENTE`);
      return;
    }

    // R2 — WHERE poste_id IS NULL : atomique, evite la double assignation si un webhook
    // a assigne un poste entre le moment ou l'orphan-checker a lu poste_id=null et maintenant.
    const orphanResult = await this.chatRepository.createQueryBuilder()
      .update(WhatsappChat)
      .set({
        poste_id: nextPoste.id,
        assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
        status: nextPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
        assigned_at: new Date(),
        first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
      })
      .where('id = :id AND poste_id IS NULL', { id: chat.id })
      .execute();
    if (!orphanResult.affected) {
      this.logger.debug(`Orphelin ignore (${chat.chat_id}): poste_id deja assigne entre-temps`);
      return;
    }

    await this.messageGateway.emitConversationAssigned(chat.chat_id);
    this.logger.log(`Orphelin dispatche (${chat.chat_id}) -> poste ${nextPoste.id}`);
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
      // passe en attente, sinon elle reste visible comme fantome sur son interface.
      this.logger.warn(
        `Aucun agent disponible pour reinjecter (${chat.chat_id}), passage EN_ATTENTE`,
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
      // 15 min au lieu de 5 min — evite que toutes les conversations non repondues
      // reviennent dans le SLA checker a chaque cycle de 5 min (boucle de charge infinie)
      first_response_deadline_at: new Date(Date.now() + 15 * 60 * 1000),
    });

    const updatedChat = await this.chatRepository.findOne({
      where: { chat_id: chat.chat_id },
      relations: ['poste'],
    });

    if (!updatedChat) {
      return;
    }
    // Notification unique lors d'une reassignation SLA effective
    void this.notificationService.create(
      'alert',
      `SLA depasse — ${updatedChat.name || updatedChat.chat_id}`,
      `La conversation de ${updatedChat.name || updatedChat.contact_client || updatedChat.chat_id.split('@')[0]} n'a pas recu de reponse dans les delais. Reassignee au poste ${nextPoste.name}.`,
    );

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
        status: In([WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE]),
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
   * Egalise les conversations non lues entre les postes presents dans la file.
   * Algorithme greedy :
   *  1. Compter les convs non lues eligibles (> threshold, hors canaux dedies) par poste
   *  2. target = ceil(total / nbPostes)
   *  3. Deplacer uniquement les excedents des postes surcharges vers les postes sous-charges
   * Resultat : tous les postes ont le meme nombre de conversations non lues apres execution.
   */
  async jobRunnerAllPostes(thresholdMinutes = 20, batchSize = 300): Promise<string> {
    if (this.isSlaRunning) {
      const elapsed = this.slaRunningStartedAt
        ? Date.now() - this.slaRunningStartedAt.getTime()
        : 0;
      if (elapsed < this.SLA_STALE_TIMEOUT_MS) {
        this.logger.warn('SLA checker deja en cours — cycle ignore');
        return 'Ignore — cycle precedent encore en cours';
      }
      this.logger.warn(`SLA checker — reset force (bloque depuis ${Math.round(elapsed / 60000)} min)`);
    }
    this.isSlaRunning = true;
    this.slaRunningStartedAt = new Date();

    try {
      // 1. Postes dans la file d'attente (connectes OU non)
      const queuePositions = await this.queueService.getQueuePositions();
      const queuedPostes = queuePositions
        .map((qp) => qp.poste)
        .filter((p): p is WhatsappPoste => p != null);

      const threshold = new Date(Date.now() - thresholdMinutes * 60_000);
      // R1 — Le commercial a repondu apres le dernier message client -> ne pas re-dispatcher.
      // Evite la race condition ou un commercial redige sa reponse pendant que le sla-checker tourne.
      const noReplyFilter = `(chat.last_poste_message_at IS NULL OR chat.last_poste_message_at < chat.last_client_message_at)`;
      // Exclut : conversations venant d'un canal dedie OU assignees a un poste dedie
      const dedicatedExclusion = `(
        (chat.channel_id IS NULL OR chat.channel_id NOT IN
          (SELECT c.channel_id FROM whapi_channels c WHERE c.poste_id IS NOT NULL))
        AND (chat.poste_id IS NULL OR chat.poste_id NOT IN
          (SELECT c.poste_id FROM whapi_channels c WHERE c.poste_id IS NOT NULL))
      )`;

      // Declare tot : necessaire pour la requete unavailableCountRows (NOT IN) et step 3.
      const posteIds = queuedPostes.map((p) => p.id);

      // Critere "conversation necessitant une reponse" : unread_count > 0 uniquement.
      // Une conversation lue (unread_count = 0) ne doit jamais etre redispatchee,
      // meme si des messages client sont encore en statut 'sent'/'delivered'.
      // NE PAS utiliser last_poste_message_at IS NULL seul : trop large (48 k+ faux positifs).
      const unreadEligibility = `chat.unread_count > 0`;

      // Step 0 : Reouverture des convs FERME non repondues sur postes actifs
      // Independant de la taille de la queue — tourne meme avec un seul poste.
      // Exclut les convs dont la fenetre a expiré (fermées par read-only-enforcement) :
      // seules les convs avec une session récemment fermée par un agent (auto_close_at encore futur)
      // sont rouvertes. Si auto_close_at < NOW(), la fenetre est expirée — ne pas rouvrir.
      const onlinePosteIds = queuedPostes.filter(p => p.is_active).map(p => p.id);
      if (onlinePosteIds.length > 0) {
        const fermeNonRepondues = await this.chatRepository
          .createQueryBuilder('chat')
          .where('chat.poste_id IN (:...onlinePosteIds)', { onlinePosteIds })
          .andWhere('chat.status = :ferme', { ferme: WhatsappChatStatus.FERME })
          .andWhere('chat.read_only = false')
          .andWhere(unreadEligibility)
          .andWhere(noReplyFilter)
          .andWhere('chat.deletedAt IS NULL')
          .andWhere(dedicatedExclusion)
          .andWhere(`EXISTS (
            SELECT 1 FROM chat_session s
            WHERE s.whatsapp_chat_id = chat.id
              AND s.ended_at IS NOT NULL
              AND s.auto_close_at IS NOT NULL
              AND s.auto_close_at >= NOW()
          )`)
          .getMany();
        const reopenedChats: WhatsappChat[] = [];
        for (const chat of fermeNonRepondues) {
          await this.chatRepository.update(chat.id, {
            status: WhatsappChatStatus.ACTIF,
            first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
          });
          reopenedChats.push(chat);
        }
        if (reopenedChats.length > 0) {
          this.logger.log(`SLA checker: ${reopenedChats.length} conversation(s) FERME reouvertes sur postes actifs`);
          for (const chat of reopenedChats) {
            void this.messageGateway.emitConversationUpsertByChatId(chat.chat_id);
          }
        }
      }

      // 2. Convs non repondues sur postes hors queue (offline temporaire OU desactive)
      const unavailableCountRows = await this.chatRepository
        .createQueryBuilder('chat')
        .select('chat.poste_id', 'poste_id')
        .addSelect('COUNT(*)', 'cnt')
        .where(unreadEligibility)
        .andWhere('(chat.last_client_message_at < :threshold OR chat.last_client_message_at IS NULL)', { threshold })
        .andWhere(noReplyFilter)
        .andWhere('chat.deletedAt IS NULL')
        .andWhere('chat.poste_id IS NOT NULL')
        .andWhere('chat.poste_id NOT IN (:...posteIds)', { posteIds })
        .andWhere(dedicatedExclusion)
        .groupBy('chat.poste_id')
        .getRawMany<{ poste_id: string; cnt: string }>();

      const unavailablePosteIds = unavailableCountRows.map((r) => r.poste_id);
      const unavailablePostes = unavailablePosteIds.length > 0
        ? await this.posteRepository.findBy({ id: In(unavailablePosteIds) })
        : [];

      // Guard : queue vide -> impossible de redistribuer
      if (queuedPostes.length === 0) {
        return 'File d\'attente vide — aucun poste actif disponible';
      }
      // Guard : queue trop petite ET aucun poste offline/bloque a vider -> rien a faire
      if (queuedPostes.length < 2 && unavailablePostes.length === 0) {
        return `File d'attente insuffisante — ${queuedPostes.length} poste(s) disponible(s)`;
      }

      // 3. Nombre de convs eligibles — postes de la queue (FERME exclues)
      const countRows = await this.chatRepository
        .createQueryBuilder('chat')
        .select('chat.poste_id', 'poste_id')
        .addSelect('COUNT(*)', 'cnt')
        .where('chat.poste_id IN (:...posteIds)', { posteIds })
        .andWhere('chat.status IN (:...eligibleStatuses)', { eligibleStatuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE] })
        .andWhere(unreadEligibility)
        .andWhere('(chat.last_client_message_at < :threshold OR chat.last_client_message_at IS NULL)', { threshold })
        .andWhere(noReplyFilter)
        .andWhere('chat.deletedAt IS NULL')
        .andWhere(dedicatedExclusion)
        .groupBy('chat.poste_id')
        .getRawMany<{ poste_id: string; cnt: string }>();

      const countMap = new Map<string, number>();
      for (const p of queuedPostes) countMap.set(p.id, 0);
      for (const row of countRows) countMap.set(row.poste_id, parseInt(row.cnt, 10));
      // Ajouter les comptes des postes offline/bloques dans le total
      for (const row of unavailableCountRows) {
        countMap.set(row.poste_id, parseInt(row.cnt, 10));
      }

      const totalEligible = [...countMap.values()].reduce((a, b) => a + b, 0);
      if (totalEligible === 0) {
        return 'Aucune conversation eligible (hors canaux dedies)';
      }

      // target calcule sur les postes de la queue uniquement (destinations)
      // Postes online dans la queue -> seules destinations valides pour le target
      const onlineQueuedPostes = queuedPostes.filter((p) => p.is_active);
      const targetBase = onlineQueuedPostes.length > 0 ? onlineQueuedPostes.length : queuedPostes.length;
      const target = Math.ceil(totalEligible / targetBase);

      // Postes offline dans la queue (is_active = false) : traites comme indisponibles
      // -> target effectif = 0, toutes leurs conversations doivent etre redistribuees
      const offlineQueuedPostes = queuedPostes.filter(
        (p) => !p.is_active && (countMap.get(p.id) ?? 0) > 0,
      );
      const offlineQueuedIds = new Set(offlineQueuedPostes.map((p) => p.id));

      // Postes surcharges : online au-dessus du target + offline dans queue + hors queue
      const overloaded = [
        ...queuedPostes.filter((p) => !offlineQueuedIds.has(p.id) && (countMap.get(p.id) ?? 0) > target),
        ...offlineQueuedPostes,
        ...unavailablePostes,
      ].sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0));

      if (overloaded.length === 0) {
        return `Charge deja equilibree — ${target} conv/poste (${totalEligible} conv, ${queuedPostes.length} postes)`;
      }

      // Postes sous-charges : postes de la queue, online prioritaires
      const underloaded = queuedPostes
        .filter((p) => (countMap.get(p.id) ?? 0) < target)
        .sort((a, b) => {
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return (countMap.get(a.id) ?? 0) - (countMap.get(b.id) ?? 0);
        });

      this.logger.log(
        `SLA equilibrage : ${totalEligible} conv eligibles, cible ${target}/poste, ` +
        `${overloaded.length} surcharge(s), ${underloaded.length} sous-charge(s) ` +
        `(${offlineQueuedPostes.length} offline dans queue)`,
      );

      // 3. Redistribution greedy
      const reassignments: Array<{ chatId: string; oldPosteId: string; newPosteId: string }> = [];
      let dispatched = 0;
      let underIdx = 0;

      const unavailablePosteIdSet = new Set(unavailablePosteIds);
      for (const srcPoste of overloaded) {
        // Offline (dans queue ou hors queue) : target effectif = 0, toutes les conv doivent partir
        const srcTarget = (unavailablePosteIdSet.has(srcPoste.id) || offlineQueuedIds.has(srcPoste.id))
          ? 0
          : target;
        const excess = (countMap.get(srcPoste.id) ?? 0) - srcTarget;
        if (excess <= 0 || underIdx >= underloaded.length) continue;

        // Convs les plus anciennes de ce poste surcharge (oldest-first) — FERME exclues
        const srcChats = await this.chatRepository
          .createQueryBuilder('chat')
          .where('chat.poste_id = :posteId', { posteId: srcPoste.id })
          .andWhere('chat.status IN (:...eligibleStatuses)', { eligibleStatuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE] })
          .andWhere(unreadEligibility)
          .andWhere('(chat.last_client_message_at < :threshold OR chat.last_client_message_at IS NULL)', { threshold })
          .andWhere(noReplyFilter)
          .andWhere('chat.deletedAt IS NULL')
          .andWhere(dedicatedExclusion)
          .orderBy('chat.last_client_message_at', 'ASC')
          .take(Math.min(excess, batchSize - dispatched))
          .getMany();

        for (const chat of srcChats) {
          // Avancer vers le prochain sous-charge qui peut encore absorber
          while (
            underIdx < underloaded.length &&
            (countMap.get(underloaded[underIdx].id) ?? 0) >= target
          ) {
            underIdx++;
          }
          if (underIdx >= underloaded.length) break;

          const destPoste = underloaded[underIdx];
          try {
            await this.chatRepository.update(chat.id, {
              poste: destPoste,
              poste_id: destPoste.id,
              assigned_mode: destPoste.is_active ? 'ONLINE' : 'OFFLINE',
              status: destPoste.is_active
                ? WhatsappChatStatus.ACTIF
                : WhatsappChatStatus.EN_ATTENTE,
              assigned_at: new Date(),
              first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
            });

            countMap.set(srcPoste.id, (countMap.get(srcPoste.id) ?? 1) - 1);
            countMap.set(destPoste.id, (countMap.get(destPoste.id) ?? 0) + 1);
            reassignments.push({ chatId: chat.chat_id, oldPosteId: srcPoste.id, newPosteId: destPoste.id });
            dispatched++;
          } catch (err) {
            this.logger.warn(`SLA reinject error (chat ${chat.id}): ${String(err)}`);
          }
        }
      }

      if (reassignments.length > 0) {
        await this.messageGateway.emitBatchReassignments(reassignments);
      }

      const summary = `${dispatched} conv reequilibree(s) — cible ${target}/poste (${totalEligible} eligibles, ${queuedPostes.length} postes)`;
      this.logger.log(`SLA checker resultat : ${summary}`);
      return summary;
    } finally {
      this.isSlaRunning = false;
      this.slaRunningStartedAt = null;
    }
  }

  async redispatchWaiting(): Promise<{ dispatched: number; still_waiting: number }> {
    const waitingChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE, unread_count: MoreThan(0) },
      relations: ['poste'],
    });

    let dispatched = 0;
    let stillWaiting = 0;

    for (const chat of waitingChats) {
      // Ignorer les conversations verrouilees (en attente de reaction client)
      if (chat.read_only) { stillWaiting++; continue; }

      // Ignorer les conversations sur canal dedie — elles ne doivent pas quitter leur poste
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

        // Notifier l'ancien poste si la conversation lui etait deja assignee
        if (oldPosteId && oldPosteId !== nextAgent.id) {
          await this.messageGateway.emitConversationRemoved(chat.chat_id, oldPosteId);
        }

        await this.messageGateway.emitConversationAssigned(chat.chat_id);
        void this.notificationService.create(
          'info',
          `Conversation assignee (manuel) — ${chat.name || chat.chat_id}`,
          `Assignee au poste ${nextAgent.name}.`,
        );
        return true;
      });

      if (assigned) {
        dispatched++;
      } else {
        // Queue vide pour cette conversation — continuer quand meme les suivantes
        stillWaiting++;
      }

      if (!lock.isLocked()) {
        this.chatDispatchLocks.delete(chat.chat_id);
      }
    }

    this.logger.log(
      `Redispatch manuel: ${dispatched} assignee(s), ${stillWaiting} toujours en attente`,
    );
    return { dispatched, still_waiting: stillWaiting };
  }

  /**
   * Reinitialise les conversations ACTIF dont l'agent est hors ligne (is_active = false)
   * vers EN_ATTENTE, sans les reassigner immediatement.
   * Les agents les recuperent naturellement en se connectant via le dispatch normal.
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
    // On passe juste le statut en EN_ATTENTE — le poste_id est conserve.
    // Quand le poste se reconnecte, la conversation est deja visible dans sa file.
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
      `resetStuckActiveToWaiting: ${stuck.length} conversation(s) -> EN_ATTENTE (poste_id conserve)`,
    );
    return { reset: stuck.length };
  }

  /**
   * Remet en ACTIF toutes les conversations EN_ATTENTE affectées à ce poste.
   * Appelé quand le poste se reconnecte — les conversations sans nouveau message
   * du client resteraient sinon EN_ATTENTE indéfiniment.
   */
  async reactivateWaitingConversationsForPoste(posteId: string): Promise<number> {
    const waiting = await this.chatRepository.find({
      where: { poste_id: posteId, status: WhatsappChatStatus.EN_ATTENTE },
      select: ['id'],
    });

    if (waiting.length === 0) return 0;

    const ids = waiting.map((c) => c.id);
    await this.chatRepository
      .createQueryBuilder()
      .update()
      .set({ status: WhatsappChatStatus.ACTIF, assigned_mode: 'ONLINE' })
      .whereInIds(ids)
      .execute();

    this.logger.log(
      `reactivateWaitingConversationsForPoste: ${waiting.length} conversation(s) EN_ATTENTE → ACTIF (poste ${posteId})`,
    );
    return waiting.length;
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
