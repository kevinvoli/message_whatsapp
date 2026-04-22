import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AffinityReleaseReason,
  ContactAssignmentAffinity,
} from '../entities/contact-assignment-affinity.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';

const FF_KEY = 'FF_STICKY_ASSIGNMENT';

@Injectable()
export class AssignmentAffinityService {
  private readonly logger = new Logger(AssignmentAffinityService.name);

  constructor(
    @InjectRepository(ContactAssignmentAffinity)
    private readonly repo: Repository<ContactAssignmentAffinity>,
    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async isEnabled(): Promise<boolean> {
    return (await this.systemConfig.get(FF_KEY)) === 'true';
  }

  async getActiveAffinity(chatId: string): Promise<ContactAssignmentAffinity | null> {
    return this.repo.findOne({ where: { chatId, isActive: true } });
  }

  /**
   * Retourne le poste d'affinité si FF_STICKY_ASSIGNMENT est actif.
   * Retourne null si FF désactivé, pas d'affinité, ou poste supprimé.
   */
  async getAffinityPoste(chatId: string): Promise<WhatsappPoste | null> {
    if (!(await this.isEnabled())) return null;
    const affinity = await this.getActiveAffinity(chatId);
    if (!affinity) return null;
    return this.posteRepo.findOne({ where: { id: affinity.posteId } });
  }

  /**
   * Crée ou met à jour l'affinité pour un chat vers un poste.
   * - Si affinité active existante vers le même poste → incrémente conversationCount.
   * - Si affinité active vers un autre poste → relâche l'ancienne, crée une nouvelle.
   * - Si pas d'affinité active → crée (ou réactive une inactive).
   */
  async upsertAffinity(chatId: string, posteId: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { chatId, isActive: true } });

    if (existing) {
      if (existing.posteId === posteId) {
        existing.conversationCount += 1;
        existing.lastAssignedAt = new Date();
        await this.repo.save(existing);
        return;
      }
      existing.isActive = false;
      existing.releasedAt = new Date();
      existing.releaseReason = AffinityReleaseReason.CLOSED;
      await this.repo.save(existing);
      this.logger.log(`AFFINITY_UPDATED chat_id=${chatId} old_poste=${existing.posteId} new_poste=${posteId}`);
    }

    const reactivable = await this.repo.findOne({ where: { chatId, posteId } });
    if (reactivable) {
      reactivable.isActive = true;
      reactivable.conversationCount += 1;
      reactivable.lastAssignedAt = new Date();
      reactivable.releasedAt = null;
      reactivable.releaseReason = null;
      await this.repo.save(reactivable);
    } else {
      await this.repo.save(
        this.repo.create({
          chatId,
          posteId,
          isActive: true,
          conversationCount: 1,
          lastAssignedAt: new Date(),
        }),
      );
    }
    this.logger.log(`AFFINITY_CREATED chat_id=${chatId} poste=${posteId}`);
  }

  async releaseAffinity(chatId: string, reason: AffinityReleaseReason): Promise<void> {
    const existing = await this.repo.findOne({ where: { chatId, isActive: true } });
    if (!existing) return;
    existing.isActive = false;
    existing.releasedAt = new Date();
    existing.releaseReason = reason;
    await this.repo.save(existing);
    this.logger.log(`AFFINITY_RELEASED chat_id=${chatId} reason=${reason}`);
  }

  /** Retourne les chat_ids ayant une affinité active vers un poste donné. */
  async getActiveChatIdsForPoste(posteId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { posteId, isActive: true },
      select: ['chatId'],
    });
    return rows.map((r) => r.chatId);
  }

  /** Vue agrégée pour l'admin : toutes les affinités actives avec compteurs. */
  async getAffinityStats(): Promise<
    { posteId: string; posteIdAlias: string; count: number; topChatIds: string[] }[]
  > {
    const actives = await this.repo.find({
      where: { isActive: true },
      order: { lastAssignedAt: 'DESC' },
    });

    const grouped = new Map<string, { count: number; chatIds: string[] }>();
    for (const a of actives) {
      const entry = grouped.get(a.posteId) ?? { count: 0, chatIds: [] };
      entry.count += 1;
      if (entry.chatIds.length < 5) entry.chatIds.push(a.chatId);
      grouped.set(a.posteId, entry);
    }

    return Array.from(grouped.entries()).map(([posteId, data]) => ({
      posteId,
      posteIdAlias: posteId,
      count: data.count,
      topChatIds: data.chatIds,
    }));
  }
}
