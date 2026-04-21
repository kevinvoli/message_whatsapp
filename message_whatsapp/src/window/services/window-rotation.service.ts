import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WhatsappChat, WindowStatus, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationCapacityService } from 'src/conversation-capacity/conversation-capacity.service';
import { ValidationEngineService } from './validation-engine.service';

export const WINDOW_ROTATED_EVENT         = 'window.rotated';
export const WINDOW_CRITERION_VALIDATED_EVENT = 'window.criterion_validated';

export interface WindowRotatedPayload {
  posteId: string;
  releasedChatIds: string[];
  promotedChatIds: string[];
}

export interface WindowCriterionValidatedPayload {
  posteId: string;
}

@Injectable()
export class WindowRotationService {
  private readonly logger = new Logger(WindowRotationService.name);
  private readonly rotatingPostes = new Set<string>();

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly capacityService: ConversationCapacityService,
    private readonly validationEngine: ValidationEngineService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Construit ou répare la fenêtre de 50 conversations pour un poste.
   * Appelé à la connexion d'un commercial.
   */
  async buildWindowForPoste(posteId: string): Promise<void> {
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

    const alreadySlotted = await this.chatRepo.count({
      where: {
        poste_id: posteId,
        window_slot: Not(IsNull()),
        window_status: Not(WindowStatus.RELEASED as any),
      },
    });

    if (alreadySlotted >= quotaTotal) {
      this.logger.log(`Fenêtre déjà complète pour poste ${posteId} (${alreadySlotted} slots)`);
      return;
    }

    // Conversations actives déjà assignées (triées par slot)
    const slottedChats = await this.chatRepo.find({
      where: {
        poste_id: posteId,
        window_slot: Not(IsNull()),
        window_status: Not(WindowStatus.RELEASED as any),
      },
      order: { window_slot: 'ASC' },
    });

    const needed = quotaTotal - slottedChats.length;
    if (needed <= 0) return;

    const slottedIds = new Set(slottedChats.map((c) => c.id));

    // Conversations non encore slottées (prioriser actif/en attente, triées par activité)
    const unslotted = await this.chatRepo.find({
      where: {
        poste_id: posteId,
        deletedAt: IsNull(),
        status: Not(In([WhatsappChatStatus.FERME])),
      },
      order: { last_activity_at: 'DESC' },
      take: needed + slottedChats.length,
    });

    const candidates = unslotted.filter((c) => !slottedIds.has(c.id)).slice(0, needed);

    if (candidates.length === 0) return;

    const nextSlot = slottedChats.length + 1;
    for (let i = 0; i < candidates.length; i++) {
      const chat = candidates[i];
      const slot = nextSlot + i;
      const status = slot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
      const isLocked = status === WindowStatus.LOCKED;

      await this.chatRepo.update(
        { id: chat.id },
        { window_slot: slot, window_status: status, is_locked: isLocked },
      );

      if (status === WindowStatus.ACTIVE) {
        await this.validationEngine.initConversationValidation(chat.chat_id);
      }
    }

    this.logger.log(`Fenêtre construite pour poste ${posteId} : ${candidates.length} nouvelles conversations assignées`);
  }

  /**
   * Écoute l'événement conversation.result_set émis par WhatsappChatService.
   * Marque le critère 'result_set' et déclenche éventuellement la rotation.
   */
  @OnEvent('conversation.result_set', { async: true })
  async handleConversationResultSet(payload: { chatId: string; posteId: string | null | undefined }): Promise<void> {
    if (!payload.posteId) return;

    const allRequiredMet = await this.validationEngine.onConversationResultSet(payload.chatId);

    // Push progression au poste dès que le critère est validé
    this.eventEmitter.emit(WINDOW_CRITERION_VALIDATED_EVENT, {
      posteId: payload.posteId,
    } satisfies WindowCriterionValidatedPayload);

    if (allRequiredMet) {
      await this.onConversationValidated(payload.chatId, payload.posteId);
    }
  }

  /**
   * Écoute la fermeture d'une conversation.
   * Libère son slot et réinjecte une conversation en fin de fenêtre.
   */
  @OnEvent('conversation.status_changed', { async: true })
  async handleConversationStatusChanged(payload: {
    chatId: string;
    newStatus: string;
  }): Promise<void> {
    if (payload.newStatus !== 'fermé') return;

    const chat = await this.chatRepo.findOne({ where: { chat_id: payload.chatId } });
    if (!chat?.poste_id || chat.window_slot == null) return;

    const posteId = chat.poste_id;
    const releasedSlot = chat.window_slot;

    // Libère le slot
    await this.chatRepo.update(
      { id: chat.id },
      { window_slot: null, window_status: WindowStatus.RELEASED, is_locked: false },
    );
    this.logger.log(`Slot ${releasedSlot} libéré (conv ${payload.chatId} fermée) pour poste ${posteId}`);

    // Réassigne les slots pour compresser le vide
    await this.compactSlots(posteId);
  }

  /**
   * Appelé quand une conversation passe à l'état "validé".
   * Met à jour window_status et vérifie si la rotation est possible.
   */
  async onConversationValidated(chatId: string, posteId: string): Promise<void> {
    const chat = await this.chatRepo.findOne({ where: { chat_id: chatId, poste_id: posteId } });
    if (!chat || chat.window_status !== WindowStatus.ACTIVE) return;

    await this.chatRepo.update({ id: chat.id }, { window_status: WindowStatus.VALIDATED });
    this.logger.log(`Conv ${chatId} marquée VALIDATED dans la fenêtre du poste ${posteId}`);

    await this.checkAndTriggerRotation(posteId);
  }

  /**
   * Vérifie si toutes les conversations actives sont validées.
   * Si oui, déclenche la rotation.
   */
  async checkAndTriggerRotation(posteId: string): Promise<void> {
    if (this.rotatingPostes.has(posteId)) return; // rotation déjà en cours

    const { quotaActive } = await this.capacityService.getQuotas();

    const activeGroup = await this.chatRepo.find({
      where: {
        poste_id: posteId,
        window_status: In([WindowStatus.ACTIVE, WindowStatus.VALIDATED]),
      },
      order: { window_slot: 'ASC' },
    });

    const allValidated = activeGroup.length > 0
      && activeGroup.every((c) => c.window_status === WindowStatus.VALIDATED);

    if (!allValidated) return;

    // On vérifie qu'on a bien quotaActive conversations (tolérance si moins)
    if (activeGroup.length < quotaActive && activeGroup.length < 3) return;

    this.logger.log(`Rotation déclenchée pour poste ${posteId} (${activeGroup.length} conversations validées)`);
    await this.performRotation(posteId);
  }

  /**
   * Effectue la rotation complète du bloc :
   * 1. Retire les conversations validées (released)
   * 2. Promeut les 10 premières verrouillées en actives
   * 3. Injecte de nouvelles conversations en fin de fenêtre
   * 4. Émet l'événement de rotation
   */
  async performRotation(posteId: string): Promise<{ releasedChatIds: string[]; promotedChatIds: string[] }> {
    this.rotatingPostes.add(posteId);
    try {
      const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

      // 1. Conversations validées à libérer
      const validated = await this.chatRepo.find({
        where: { poste_id: posteId, window_status: WindowStatus.VALIDATED },
        order: { window_slot: 'ASC' },
      });

      const releasedChatIds: string[] = [];
      for (const chat of validated) {
        await this.chatRepo.update(
          { id: chat.id },
          { window_status: WindowStatus.RELEASED, window_slot: null, is_locked: false },
        );
        releasedChatIds.push(chat.chat_id);
      }

      // 2. Conversations verrouillées restantes — réassigner les slots
      const remaining = await this.chatRepo.find({
        where: {
          poste_id: posteId,
          window_status: In([WindowStatus.LOCKED, WindowStatus.ACTIVE]),
          window_slot: Not(IsNull()),
        },
        order: { window_slot: 'ASC' },
      });

      const promotedChatIds: string[] = [];
      for (let i = 0; i < remaining.length; i++) {
        const chat = remaining[i];
        const newSlot = i + 1;
        const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
        const wasLocked = chat.window_status === WindowStatus.LOCKED;
        const promoted = wasLocked && newStatus === WindowStatus.ACTIVE;

        await this.chatRepo.update(
          { id: chat.id },
          { window_slot: newSlot, window_status: newStatus, is_locked: newStatus === WindowStatus.LOCKED },
        );

        if (promoted) {
          promotedChatIds.push(chat.chat_id);
          await this.validationEngine.initConversationValidation(chat.chat_id);
        }
      }

      // 3. Injecter de nouvelles conversations (non encore dans la fenêtre)
      const slotsUsed = remaining.length;
      const slotsAvailable = quotaTotal - slotsUsed;

      if (slotsAvailable > 0) {
        const existingIds = new Set(remaining.map((c) => c.id));
        releasedChatIds.forEach((_, idx) => {
          const rel = validated[idx];
          if (rel) existingIds.add(rel.id);
        });

        const newCandidates = await this.chatRepo.find({
          where: {
            poste_id: posteId,
            deletedAt: IsNull(),
            status: Not(In([WhatsappChatStatus.FERME])),
          },
          order: { last_activity_at: 'DESC' },
          take: slotsAvailable + validated.length,
        });

        const toInject = newCandidates.filter((c) => !existingIds.has(c.id)).slice(0, slotsAvailable);
        for (let i = 0; i < toInject.length; i++) {
          const chat = toInject[i];
          const newSlot = slotsUsed + i + 1;
          const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
          await this.chatRepo.update(
            { id: chat.id },
            { window_slot: newSlot, window_status: newStatus, is_locked: newStatus === WindowStatus.LOCKED },
          );
          if (newStatus === WindowStatus.ACTIVE) {
            await this.validationEngine.initConversationValidation(chat.chat_id);
          }
        }

        this.logger.log(`${toInject.length} nouvelles conversations injectées pour poste ${posteId}`);
      }

      this.logger.log(
        `Rotation complète poste ${posteId} — libérées: ${releasedChatIds.length}, promues: ${promotedChatIds.length}`,
      );

      this.eventEmitter.emit(WINDOW_ROTATED_EVENT, {
        posteId,
        releasedChatIds,
        promotedChatIds,
      } satisfies WindowRotatedPayload);

      return { releasedChatIds, promotedChatIds };
    } finally {
      this.rotatingPostes.delete(posteId);
    }
  }

  /**
   * Réassigne les slots consécutivement après une fermeture de conversation.
   * Compresse les trous dans la numérotation et injecte une nouvelle conversation si possible.
   */
  private async compactSlots(posteId: string): Promise<void> {
    const { quotaActive, quotaTotal } = await this.capacityService.getQuotas();

    const current = await this.chatRepo.find({
      where: {
        poste_id: posteId,
        window_slot: Not(IsNull()),
        window_status: Not(WindowStatus.RELEASED as any),
      },
      order: { window_slot: 'ASC' },
    });

    // Réassigner slots 1…N
    for (let i = 0; i < current.length; i++) {
      const chat = current[i];
      const newSlot = i + 1;
      const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
      const wasLocked = chat.window_status === WindowStatus.LOCKED;
      const nowActive = newStatus === WindowStatus.ACTIVE;

      await this.chatRepo.update(
        { id: chat.id },
        { window_slot: newSlot, window_status: newStatus, is_locked: !nowActive },
      );

      if (wasLocked && nowActive) {
        await this.validationEngine.initConversationValidation(chat.chat_id);
      }
    }

    // Injecter une nouvelle conversation si de la place est disponible
    const slotsUsed = current.length;
    if (slotsUsed < quotaTotal) {
      const existingIds = new Set(current.map((c) => c.id));
      const candidates = await this.chatRepo.find({
        where: {
          poste_id: posteId,
          deletedAt: IsNull(),
          status: Not(In([WhatsappChatStatus.FERME])),
        },
        order: { last_activity_at: 'DESC' },
        take: slotsUsed + 5,
      });

      const toInject = candidates.filter((c) => !existingIds.has(c.id)).slice(0, quotaTotal - slotsUsed);
      for (let i = 0; i < toInject.length; i++) {
        const chat = toInject[i];
        const newSlot = slotsUsed + i + 1;
        const newStatus = newSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
        await this.chatRepo.update(
          { id: chat.id },
          { window_slot: newSlot, window_status: newStatus, is_locked: newStatus === WindowStatus.LOCKED },
        );
        if (newStatus === WindowStatus.ACTIVE) {
          await this.validationEngine.initConversationValidation(chat.chat_id);
        }
      }

      if (toInject.length > 0) {
        this.logger.log(`${toInject.length} conversation(s) injectée(s) après compactage pour poste ${posteId}`);
      }
    }
  }
}
