import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappChat, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';

const KEY_QUOTA_ACTIVE    = 'CAPACITY_QUOTA_ACTIVE';
const KEY_QUOTA_TOTAL     = 'CAPACITY_QUOTA_TOTAL';
const KEY_WINDOW_MODE     = 'SLIDING_WINDOW_ENABLED';
const DEFAULT_QUOTA_ACTIVE = 10;
const DEFAULT_QUOTA_TOTAL  = 50;

export interface CapacitySummaryEntry {
  posteId: string;
  posteName: string;
  activeCount: number;
  validatedCount: number;
  lockedCount: number;
  totalCount: number;
  quotaActive: number;
  quotaTotal: number;
}

@Injectable()
export class ConversationCapacityService {
  private readonly logger = new Logger(ConversationCapacityService.name);
  /** Mutex par poste pour éviter les race conditions sur l'assignation de slots. */
  private readonly assigningPostes = new Map<string, Promise<boolean>>();

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly systemConfig: SystemConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getQuotas(): Promise<{ quotaActive: number; quotaTotal: number }> {
    const [a, t] = await Promise.all([
      this.systemConfig.get(KEY_QUOTA_ACTIVE),
      this.systemConfig.get(KEY_QUOTA_TOTAL),
    ]);
    return {
      quotaActive: a ? parseInt(a, 10) : DEFAULT_QUOTA_ACTIVE,
      quotaTotal: t ? parseInt(t, 10) : DEFAULT_QUOTA_TOTAL,
    };
  }

  async setQuotas(quotaActive: number, quotaTotal: number): Promise<void> {
    await Promise.all([
      this.systemConfig.set(KEY_QUOTA_ACTIVE, String(quotaActive)),
      this.systemConfig.set(KEY_QUOTA_TOTAL, String(quotaTotal)),
    ]);
  }

  async isWindowModeEnabled(): Promise<boolean> {
    const val = await this.systemConfig.get(KEY_WINDOW_MODE);
    // Par défaut activé (true) si la clé n'est pas encore configurée
    return val === null || val === 'true';
  }

  async setWindowMode(enabled: boolean): Promise<void> {
    await this.systemConfig.set(KEY_WINDOW_MODE, enabled ? 'true' : 'false');
    this.logger.log(`Mode fenêtre glissante ${enabled ? 'activé' : 'désactivé'}`);
  }

  async countForPoste(
    posteId: string,
  ): Promise<{ active: number; locked: number; total: number }> {
    const rows = await this.chatRepo
      .createQueryBuilder('c')
      .select('c.window_status', 'window_status')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.status != :ferme', { ferme: 'fermé' })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.window_slot IS NOT NULL')
      .groupBy('c.window_status')
      .getRawMany<{ window_status: string | null; cnt: string }>();

    let active = 0;
    let locked = 0;
    for (const row of rows) {
      const count = Number(row.cnt);
      if (row.window_status === WindowStatus.LOCKED) locked += count;
      else if (row.window_status === WindowStatus.ACTIVE || row.window_status === WindowStatus.VALIDATED) active += count;
    }
    return { active, locked, total: active + locked };
  }

  /**
   * Déverrouille la plus ancienne conversation verrouillée (mode classique).
   * Appelé par WindowRotationService quand le mode glissant est désactivé.
   */
  async onConversationQualifiedLegacy(posteId: string): Promise<void> {
    const oldest = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.is_locked = true')
      .andWhere('c.status != :ferme', { ferme: 'fermé' })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.createdAt', 'ASC')
      .getOne();

    if (!oldest) return;
    await this.chatRepo.update({ id: oldest.id }, { is_locked: false });
    this.logger.log(`Conv ${oldest.chat_id} déverrouillée (mode classique, poste ${posteId})`);
  }

  /**
   * Appelé après qu'une conversation est assignée à un poste.
   * Si mode glissant activé : assigne un slot de fenêtre.
   * Si mode glissant désactivé : verrouille si quotaActive dépassé (ancien comportement).
   * Retourne true si la conversation a été verrouillée.
   */
  async onConversationAssigned(chat: WhatsappChat): Promise<boolean> {
    if (!chat.poste_id) return false;
    if (chat.window_slot != null) return chat.is_locked;

    const modeEnabled = await this.isWindowModeEnabled();

    if (!modeEnabled) {
      // Mode classique : verrouiller si quotaActive dépassé
      const { quotaActive } = await this.getQuotas();
      const { active } = await this.countForPoste(chat.poste_id);
      if (active > quotaActive) {
        await this.chatRepo.update({ id: chat.id }, { is_locked: true });
        this.logger.log(`Conv ${chat.chat_id} verrouillée (mode classique, quota actif: ${active}/${quotaActive})`);
        return true;
      }
      return false;
    }

    const posteId = chat.poste_id;

    // Sérialiser les assignations par poste (évite les doublons de slot)
    const pending = this.assigningPostes.get(posteId) ?? Promise.resolve(false);
    const next = pending.then(() => this.doAssignSlot(chat));
    this.assigningPostes.set(posteId, next.catch(() => false));
    try {
      const result = await next;
      return result;
    } finally {
      if (this.assigningPostes.get(posteId) === next) {
        this.assigningPostes.delete(posteId);
      }
    }
  }

  private async doAssignSlot(chat: WhatsappChat): Promise<boolean> {
    const posteId = chat.poste_id!;
    const { quotaActive, quotaTotal } = await this.getQuotas();

    const slotsUsed = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.window_slot IS NOT NULL')
      .andWhere('c.window_status != :released', { released: WindowStatus.RELEASED })
      .andWhere('c.status != :ferme', { ferme: 'fermé' })
      .getCount();

    const nextSlot = slotsUsed + 1;

    if (nextSlot > quotaTotal) {
      await this.chatRepo.update({ id: chat.id }, { is_locked: true });
      this.logger.log(`Conv ${chat.chat_id} hors fenêtre (slot ${nextSlot}/${quotaTotal})`);
      return true;
    }

    const status = nextSlot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED;
    const isLocked = status === WindowStatus.LOCKED;

    await this.chatRepo.update(
      { id: chat.id },
      { window_slot: nextSlot, window_status: status, is_locked: isLocked },
    );

    this.logger.log(`Conv ${chat.chat_id} assignée slot ${nextSlot}/${quotaTotal} → ${status}`);
    return isLocked;
  }

  /**
   * @deprecated Remplacé par WindowRotationService.onConversationValidated.
   * Conservé pour compatibilité pendant la transition.
   */
  async onConversationQualified(_posteId: string): Promise<void> {
    // La rotation par bloc est maintenant gérée par WindowRotationService.
    // Cette méthode est conservée pour éviter les erreurs de compilation des
    // appelants existants jusqu'à leur migration complète.
  }

  /**
   * Planifie un compactage de fenêtre pour un poste (fire-and-forget).
   * Utilisé après réassignation pour nettoyer l'ancien poste.
   */
  scheduleCompact(posteId: string): void {
    this.eventEmitter.emit('window.compact_requested', { posteId });
  }

  /** Force-déverrouille une conversation (admin). */
  async forceUnlock(chatId: string): Promise<WhatsappChat> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException(`Conversation ${chatId} introuvable`);
    await this.chatRepo.update({ id: chatId }, { is_locked: false });
    return { ...chat, is_locked: false };
  }

  /** Résumé de capacité par poste (admin). */
  async getCapacitySummary(): Promise<CapacitySummaryEntry[]> {
    const { quotaActive, quotaTotal } = await this.getQuotas();

    const rows = await this.chatRepo
      .createQueryBuilder('c')
      .innerJoin('c.poste', 'p')
      .select('c.poste_id', 'posteId')
      .addSelect('p.name', 'posteName')
      .addSelect("SUM(CASE WHEN c.window_status = 'active'    THEN 1 ELSE 0 END)", 'active')
      .addSelect("SUM(CASE WHEN c.window_status = 'validated' THEN 1 ELSE 0 END)", 'validated')
      .addSelect("SUM(CASE WHEN c.window_status = 'locked'    THEN 1 ELSE 0 END)", 'locked')
      .addSelect('COUNT(*)', 'total')
      .where('c.status != :ferme', { ferme: 'fermé' })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.poste_id IS NOT NULL')
      .andWhere('c.window_slot IS NOT NULL')
      .groupBy('c.poste_id')
      .addGroupBy('p.name')
      .getRawMany<{
        posteId: string;
        posteName: string;
        active: string;
        validated: string;
        locked: string;
        total: string;
      }>();

    return rows.map((r) => ({
      posteId: r.posteId,
      posteName: r.posteName,
      activeCount: Number(r.active),
      validatedCount: Number(r.validated),
      lockedCount: Number(r.locked),
      totalCount: Number(r.total),
      quotaActive,
      quotaTotal,
    }));
  }
}
