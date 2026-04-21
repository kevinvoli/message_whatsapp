import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';

const KEY_QUOTA_ACTIVE = 'CAPACITY_QUOTA_ACTIVE';
const KEY_QUOTA_TOTAL = 'CAPACITY_QUOTA_TOTAL';
const DEFAULT_QUOTA_ACTIVE = 10;
const DEFAULT_QUOTA_TOTAL = 50;

export interface CapacitySummaryEntry {
  posteId: string;
  posteName: string;
  activeCount: number;
  lockedCount: number;
  totalCount: number;
  quotaActive: number;
  quotaTotal: number;
}

@Injectable()
export class ConversationCapacityService {
  private readonly logger = new Logger(ConversationCapacityService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly systemConfig: SystemConfigService,
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

  async countForPoste(
    posteId: string,
  ): Promise<{ active: number; locked: number; total: number }> {
    const rows = await this.chatRepo
      .createQueryBuilder('c')
      .select('c.is_locked', 'is_locked')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.poste_id = :posteId', { posteId })
      .andWhere('c.status != :ferme', { ferme: 'fermé' })
      .andWhere('c.deletedAt IS NULL')
      .groupBy('c.is_locked')
      .getRawMany<{ is_locked: number; cnt: string }>();

    let active = 0;
    let locked = 0;
    for (const row of rows) {
      const count = Number(row.cnt);
      if (row.is_locked) locked += count;
      else active += count;
    }
    return { active, locked, total: active + locked };
  }

  /**
   * Appelé après qu'une conversation est assignée à un poste.
   * Verrouille la conversation si le quota actif est dépassé.
   * Retourne true si la conversation a été verrouillée.
   */
  async onConversationAssigned(chat: WhatsappChat): Promise<boolean> {
    if (!chat.poste_id) return false;

    const { quotaActive } = await this.getQuotas();
    const { active } = await this.countForPoste(chat.poste_id);

    if (active > quotaActive) {
      await this.chatRepo.update({ id: chat.id }, { is_locked: true });
      this.logger.log(
        `Conv ${chat.chat_id} verrouillée (quota actif: ${active}/${quotaActive})`,
      );
      return true;
    }
    return false;
  }

  /**
   * Appelé après qu'une conversation est qualifiée (résultat défini).
   * Déverrouille la plus ancienne conversation verrouillée du même poste.
   */
  async onConversationQualified(posteId: string): Promise<void> {
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
    this.logger.log(
      `Conv ${oldest.chat_id} déverrouillée (slot libéré pour poste ${posteId})`,
    );
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
      .addSelect('SUM(CASE WHEN c.is_locked = 0 THEN 1 ELSE 0 END)', 'active')
      .addSelect('SUM(CASE WHEN c.is_locked = 1 THEN 1 ELSE 0 END)', 'locked')
      .addSelect('COUNT(*)', 'total')
      .where('c.status != :ferme', { ferme: 'fermé' })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.poste_id IS NOT NULL')
      .groupBy('c.poste_id')
      .addGroupBy('p.name')
      .getRawMany<{
        posteId: string;
        posteName: string;
        active: string;
        locked: string;
        total: string;
      }>();

    return rows.map((r) => ({
      posteId: r.posteId,
      posteName: r.posteName,
      activeCount: Number(r.active),
      lockedCount: Number(r.locked),
      totalCount: Number(r.total),
      quotaActive,
      quotaTotal,
    }));
  }
}
