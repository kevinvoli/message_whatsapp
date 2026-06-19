import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { TTL_CTWA_HOURS, TTL_NORMAL_HOURS } from './constants';
import { CronConfig } from 'src/jorbs/entities/cron-config.entity';

export interface ReferralData {
  sourceId: string;
  sourceType?: string;
  headline?: string;
  imageUrl?: string;
}

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dataSource: DataSource,
    @InjectRepository(CronConfig)
    private readonly cronConfigRepo: Repository<CronConfig>,
  ) {}

  /**
   * Lit le TTL CTWA configuré dans cron_config (clé 'window-reminder').
   * Fallback sur la constante TTL_CTWA_HOURS si la ligne est absente ou la colonne NULL.
   */
  private async resolveTtlCtwaHours(): Promise<number> {
    try {
      const config = await this.cronConfigRepo.findOne({
        where: { key: 'window-reminder' },
        select: ['ttlDaysCtwa'],
      });
      if (config?.ttlDaysCtwa && config.ttlDaysCtwa > 0) {
        return config.ttlDaysCtwa;
      }
    } catch {
      // Table absente en dev ou erreur transitoire
    }
    return TTL_CTWA_HOURS;
  }

  // ─────────────────────────────── Helpers ────────────────────────────────

  private computeWindows(
    now: Date,
    ttlNormalHours: number = TTL_NORMAL_HOURS,
    isCtwa: boolean = false,
    ttlCtwaHours: number = TTL_CTWA_HOURS,
    existingFreeEntry: Date | null = null,
  ): {
    serviceWindowExpiresAt: Date;
    freeEntryExpiresAt: Date | null;
    autoCloseAt: Date;
  } {
    const effectiveTtlNormal = ttlNormalHours > 0 ? ttlNormalHours : TTL_NORMAL_HOURS;
    const effectiveTtlCtwa = ttlCtwaHours > 0 ? ttlCtwaHours : TTL_CTWA_HOURS;
    const serviceWindowExpiresAt = new Date(now.getTime() + effectiveTtlNormal * 3_600_000);

    let freeEntryExpiresAt: Date | null = existingFreeEntry;
    if (isCtwa && !existingFreeEntry) {
      freeEntryExpiresAt = new Date(now.getTime() + effectiveTtlCtwa * 3_600_000);
    }

    const autoCloseAt =
      isCtwa && freeEntryExpiresAt && freeEntryExpiresAt > serviceWindowExpiresAt
        ? freeEntryExpiresAt
        : serviceWindowExpiresAt;

    return { serviceWindowExpiresAt, freeEntryExpiresAt, autoCloseAt };
  }

  // ──────────────────────────── Méthodes publiques ─────────────────────────

  /**
   * Ouvre une session pour un chat.
   * Utilise SELECT FOR UPDATE pour éviter les doublons concurrents.
   */
  async openSession(
    whatsappChatId: string,
    isCtwa: boolean,
    ttlNormalHours: number,
    ttlCtwaHours: number,
    referral?: ReferralData,
  ): Promise<ChatSession> {
    const effectiveTtlCtwa = ttlCtwaHours === TTL_CTWA_HOURS
      ? await this.resolveTtlCtwaHours()
      : ttlCtwaHours;
    return this.openSessionInternal(whatsappChatId, isCtwa, ttlNormalHours, effectiveTtlCtwa, referral);
  }

  private async openSessionInternal(
    whatsappChatId: string,
    isCtwa: boolean,
    ttlNormalHours: number,
    ttlCtwaHours: number,
    referral?: ReferralData,
  ): Promise<ChatSession> {
    return this.dataSource.transaction(async (manager) => {
      // Verrouillage pessimiste pour éviter les races concurrentes
      const chat = await manager
        .createQueryBuilder(WhatsappChat, 'wc')
        .where('wc.id = :id', { id: whatsappChatId })
        .setLock('pessimistic_write')
        .getOne();

      if (!chat) {
        throw new Error(`WhatsappChat introuvable : ${whatsappChatId}`);
      }

      // Vérifier s'il existe déjà une session active
      if (chat.activeSessionId) {
        const existing = await manager.findOne(ChatSession, {
          where: { id: chat.activeSessionId, endedAt: undefined },
        });
        if (existing && !existing.endedAt) {
          return existing;
        }
      }

      const now = new Date();
      const { serviceWindowExpiresAt, freeEntryExpiresAt, autoCloseAt } =
        this.computeWindows(now, ttlNormalHours, isCtwa, ttlCtwaHours);

      const session = manager.create(ChatSession, {
        whatsappChatId,
        startedAt: now,
        endedAt: null,
        isCtwa,
        ctwaReferralId: referral?.sourceId ?? null,
        campaignName: referral?.headline ?? null,
        campaignImageUrl: referral?.imageUrl ?? null,
        lastClientMessageAt: now,
        lastPosteMessageAt: null,
        serviceWindowExpiresAt,
        freeEntryExpiresAt,
        autoCloseAt,
        lastWindowReminderSentAt: null,
      });

      const saved = await manager.save(ChatSession, session);

      await manager.update(WhatsappChat, { id: whatsappChatId }, {
        activeSessionId: saved.id,
        isCtwa,
        last_client_message_at: now,
        windowExpiresAt: autoCloseAt,
      });

      return saved;
    });
  }

  /**
   * Traite un nouveau message client entrant sur une session existante.
   * Recalcule la fenêtre de service et détecte un éventuel upgrade CTWA.
   */
  async onClientMessage(
    sessionId: string,
    whatsappChatId: string,
    ttlNormalHours: number,
    ttlCtwaHours: number = TTL_CTWA_HOURS,
    referral?: ReferralData,
  ): Promise<void> {
    const resolvedTtlCtwa = ttlCtwaHours === TTL_CTWA_HOURS
      ? await this.resolveTtlCtwaHours()
      : ttlCtwaHours;
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      this.logger.warn(`onClientMessage: session introuvable id=${sessionId}`);
      return;
    }

    const now = new Date();
    const becomeCtwa = !session.isCtwa && !!referral?.sourceId;
    const newIsCtwa = session.isCtwa || becomeCtwa;

    const effectiveTtlNormal = ttlNormalHours > 0 ? ttlNormalHours : TTL_NORMAL_HOURS;
    const effectiveTtlCtwa = resolvedTtlCtwa > 0 ? resolvedTtlCtwa : TTL_CTWA_HOURS;

    const serviceWindowExpiresAt = new Date(now.getTime() + effectiveTtlNormal * 3_600_000);

    let freeEntryExpiresAt = session.freeEntryExpiresAt;
    if (becomeCtwa) {
      freeEntryExpiresAt = new Date(now.getTime() + effectiveTtlCtwa * 3_600_000);
    }

    const autoCloseAt =
      newIsCtwa && freeEntryExpiresAt && freeEntryExpiresAt > serviceWindowExpiresAt
        ? freeEntryExpiresAt
        : serviceWindowExpiresAt;

    await this.sessionRepo.update(
      { id: sessionId },
      {
        lastClientMessageAt: now,
        serviceWindowExpiresAt,
        ...(becomeCtwa
          ? {
              isCtwa: true,
              ctwaReferralId: referral?.sourceId ?? null,
              campaignName: referral?.headline ?? null,
              campaignImageUrl: referral?.imageUrl ?? null,
              freeEntryExpiresAt,
            }
          : {}),
        autoCloseAt,
      },
    );

    const chatPatch: Partial<WhatsappChat> = {
      last_client_message_at: now,
      windowExpiresAt: autoCloseAt,
    };
    if (becomeCtwa) {
      chatPatch.isCtwa = true;
    }
    await this.chatRepo.update({ id: whatsappChatId }, chatPatch);
  }

  /**
   * Enregistre le timestamp du dernier message commercial (poste) sur la session.
   */
  async onPosteMessage(sessionId: string): Promise<void> {
    await this.sessionRepo.update({ id: sessionId }, {
      lastPosteMessageAt: new Date(),
    });
  }

  /**
   * Ferme une session proprement (ex : fermeture manuelle par l'agent).
   */
  async closeSession(sessionId: string, whatsappChatId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(ChatSession, { id: sessionId }, { endedAt: new Date() });
      await manager.update(WhatsappChat, { id: whatsappChatId }, {
        activeSessionId: null,
        windowExpiresAt: null,
      });
    });
  }

  /**
   * Ferme la session active d'un chat identifié par son UUID (whatsapp_chat.id).
   * Idempotent : n'affecte que la session avec ended_at IS NULL.
   */
  async closeSessionByChatId(whatsappChatId: string): Promise<void> {
    await this.sessionRepo
      .createQueryBuilder()
      .update(ChatSession)
      .set({ endedAt: new Date() })
      .where('whatsapp_chat_id = :whatsappChatId', { whatsappChatId })
      .andWhere('ended_at IS NULL')
      .execute();

    await this.chatRepo.update({ id: whatsappChatId }, { windowExpiresAt: null });
  }

  /**
   * Ferme la session active d'un chat identifié par son chat_id Whapi (ex: 336...@c.us).
   * Idempotent : n'affecte que la session avec ended_at IS NULL.
   */
  async closeSessionByWhapiChatId(whapiChatId: string): Promise<void> {
    await this.sessionRepo
      .createQueryBuilder()
      .update(ChatSession)
      .set({ endedAt: new Date() })
      .where(
        'whatsapp_chat_id IN (SELECT id FROM whatsapp_chat WHERE chat_id = :whapiChatId)',
        { whapiChatId },
      )
      .andWhere('ended_at IS NULL')
      .execute();

    await this.chatRepo
      .createQueryBuilder()
      .update(WhatsappChat)
      .set({ windowExpiresAt: null })
      .where('chat_id = :whapiChatId', { whapiChatId })
      .execute();
  }

  /**
   * Ferme une session expirée et met à jour le chat (status=fermé, read_only=false).
   * Retourne le chat_id métier (identifiant Whapi) pour l'émission du websocket.
   */
  async closeExpiredSessionAndChat(
    sessionId: string,
    whatsappChatId: string,
  ): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(ChatSession, { id: sessionId }, { endedAt: new Date() });

      await manager.update(WhatsappChat, { id: whatsappChatId }, {
        activeSessionId: null,
        status: WhatsappChatStatus.FERME,
        read_only: false,
        windowExpiresAt: null,
      });

      const chat = await manager.findOne(WhatsappChat, { where: { id: whatsappChatId } });
      return chat?.chat_id ?? whatsappChatId;
    });
  }

  /**
   * Marque le reminder de fenêtre comme envoyé de façon atomique (idempotent).
   * Retourne false si déjà marqué (autre instance l'a fait en premier).
   */
  async markWindowReminderSent(sessionId: string, whatsappChatId: string): Promise<boolean> {
    const result = await this.sessionRepo
      .createQueryBuilder()
      .update(ChatSession)
      .set({ lastWindowReminderSentAt: new Date() })
      .where('id = :id', { id: sessionId })
      .andWhere('last_window_reminder_sent_at IS NULL')
      .execute();

    if (!result.affected || result.affected === 0) {
      return false;
    }

    // Synchroniser le cache sur WhatsappChat (Sprint A — colonne last_window_reminder_sent_at)
    try {
      await this.chatRepo.update({ id: whatsappChatId }, {
        last_window_reminder_sent_at: new Date(),
      } as Partial<WhatsappChat>);
    } catch {
      // Colonne non encore présente (Sprint A) — silencieux
    }

    return true;
  }

  /**
   * Ferme la session active d'un chat et met à jour son statut (status=fermé).
   * Idempotent : ne ferme que les sessions avec ended_at IS NULL.
   */
  async closeExpiredChatByWindowExpiry(whatsappChatId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(ChatSession)
        .set({ endedAt: new Date() })
        .where('whatsapp_chat_id = :whatsappChatId', { whatsappChatId })
        .andWhere('ended_at IS NULL')
        .execute();

      await manager.update(WhatsappChat, { id: whatsappChatId }, {
        activeSessionId: null,
        status: WhatsappChatStatus.FERME,
        read_only: false,
        windowExpiresAt: null,
      });
    });
  }

  /**
   * Retourne la session active d'un chat, ou null si aucune.
   */
  async getActiveSession(whatsappChatId: string): Promise<ChatSession | null> {
    return this.sessionRepo
      .createQueryBuilder('s')
      .where('s.whatsapp_chat_id = :id', { id: whatsappChatId })
      .andWhere('s.ended_at IS NULL')
      .getOne();
  }
}
