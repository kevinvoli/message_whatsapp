import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappChat, WhatsappChatStatus, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage, MessageDirection } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { ConversationReport } from 'src/gicop-report/entities/conversation-report.entity';
import { FollowUp, FollowUpStatus } from 'src/follow-up/entities/follow_up.entity';
import { CallObligationService } from 'src/call-obligations/call-obligation.service';

export type GateStatus = 'allow' | 'warn' | 'block' | 'redirect_to_task';

export interface BlockingItem {
  code:    string;
  label:   string;
  count:   number;
  action?: string;
}

export interface GateResult {
  status:      GateStatus;
  primaryCode: string | null;
  primaryLabel: string | null;
  blockers:    BlockingItem[];
  warnings:    BlockingItem[];
  checkedAt:   string;
}

const CALL_MSG_TYPES = ['call', 'voice_call', 'video_call', 'missed_call'];

@Injectable()
export class CommercialActionGateService {
  private readonly logger = new Logger(CommercialActionGateService.name);

  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    private readonly callObligationService: CallObligationService,
  ) {}

  async evaluate(commercialId: string): Promise<GateResult> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId },
      relations: ['poste'],
    });
    const posteId = commercial?.poste?.id ?? null;

    const [
      missedCallCount,
      unansweredCount,
      withoutReportCount,
      callObligation,
      overdueFollowUps,
      priorityCount,
    ] = await Promise.all([
      this.countMissedCalls(posteId),
      this.countUnansweredMessages(posteId, commercialId),
      this.countConvsWithoutReport(posteId, commercialId),
      posteId ? this.callObligationService.getStatus(posteId).catch(() => null) : null,
      this.countOverdueFollowUps(commercialId),
      this.countPriorityConvs(posteId, commercialId),
    ]);

    const blockers: BlockingItem[] = [];
    const warnings: BlockingItem[] = [];

    // 1. Conversations prioritaires (réouvertures urgentes)
    if (priorityCount > 0) {
      blockers.push({
        code:   'PRIORITY_CONV',
        label:  `${priorityCount} conversation(s) prioritaire(s) en attente`,
        count:  priorityCount,
        action: 'Ouvrir la conversation prioritaire',
      });
    }

    // 2. Appels en absence non traités
    if (missedCallCount > 0) {
      blockers.push({
        code:   'MISSED_CALLS',
        label:  `${missedCallCount} appel(s) en absence non traité(s)`,
        count:  missedCallCount,
        action: 'Rappeler les clients',
      });
    }

    // 3. Messages entrants non répondus
    if (unansweredCount > 0) {
      blockers.push({
        code:   'UNANSWERED_MESSAGES',
        label:  `${unansweredCount} message(s) client non répondu(s)`,
        count:  unansweredCount,
        action: 'Répondre aux messages',
      });
    }

    // 4. Obligations d'appels en cours (batch non complété)
    if (callObligation && !callObligation.readyForRotation) {
      const remaining =
        Math.max(0, callObligation.annulee.required      - callObligation.annulee.done) +
        Math.max(0, callObligation.livree.required       - callObligation.livree.done) +
        Math.max(0, callObligation.sansCommande.required - callObligation.sansCommande.done);
      if (remaining > 0) {
        blockers.push({
          code:   'CALL_OBLIGATIONS',
          label:  `Obligations d'appels en cours (${remaining} appel(s) restant(s))`,
          count:  remaining,
          action: 'Effectuer les appels requis',
        });
      }
    }

    // 5. Conversations actives sans rapport soumis
    if (withoutReportCount > 0) {
      warnings.push({
        code:   'MISSING_REPORTS',
        label:  `${withoutReportCount} conversation(s) sans rapport soumis`,
        count:  withoutReportCount,
        action: 'Soumettre les rapports manquants',
      });
    }

    // 6. Relances arrivées à échéance
    if (overdueFollowUps > 0) {
      warnings.push({
        code:   'OVERDUE_FOLLOWUPS',
        label:  `${overdueFollowUps} relance(s) en retard`,
        count:  overdueFollowUps,
        action: 'Effectuer les relances en retard',
      });
    }

    let status: GateStatus = 'allow';
    if (blockers.length > 0) {
      const hasRedirect = blockers.some((b) => b.code === 'CALL_OBLIGATIONS');
      status = hasRedirect ? 'redirect_to_task' : 'block';
    } else if (warnings.length > 0) {
      status = 'warn';
    }

    const primary = blockers[0] ?? warnings[0] ?? null;

    this.logger.debug(`Gate ${commercialId} → ${status} (${blockers.length} blockers, ${warnings.length} warnings)`);

    return {
      status,
      primaryCode:  primary?.code  ?? null,
      primaryLabel: primary?.label ?? null,
      blockers,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Checks ──────────────────────────────────────────────────────────────────

  private async countMissedCalls(posteId: string | null): Promise<number> {
    if (!posteId) return 0;
    return this.messageRepo
      .createQueryBuilder('m')
      .innerJoin('whatsapp_chat', 'c', 'c.chat_id = m.chat_id AND c.deletedAt IS NULL AND c.poste_id = :posteId', { posteId })
      .where('m.direction = :dir', { dir: MessageDirection.IN })
      .andWhere('m.type IN (:...types)', { types: CALL_MSG_TYPES })
      .andWhere('c.unread_count > 0')
      .andWhere('m.deletedAt IS NULL')
      .getCount();
  }

  private async countUnansweredMessages(posteId: string | null, commercialId: string): Promise<number> {
    const qb = this.chatRepo
      .createQueryBuilder('c')
      .where('c.deletedAt IS NULL')
      .andWhere('c.status = :status', { status: WhatsappChatStatus.ACTIF })
      .andWhere('c.window_status = :ws', { ws: WindowStatus.ACTIVE })
      .andWhere('c.unread_count > 0')
      .andWhere('c.last_client_message_at IS NOT NULL');

    if (posteId) {
      qb.andWhere('c.poste_id = :posteId', { posteId });
    }

    return qb.getCount();
  }

  private async countConvsWithoutReport(posteId: string | null, commercialId: string): Promise<number> {
    const qb = this.chatRepo
      .createQueryBuilder('c')
      .leftJoin(
        'conversation_report',
        'r',
        'r.chat_id = c.chat_id AND r.is_submitted = 1',
      )
      .where('c.deletedAt IS NULL')
      .andWhere('c.status = :status', { status: WhatsappChatStatus.ACTIF })
      .andWhere('c.window_status = :ws', { ws: WindowStatus.ACTIVE })
      .andWhere('r.id IS NULL');

    if (posteId) {
      qb.andWhere('c.poste_id = :posteId', { posteId });
    }

    return qb.getCount();
  }

  private async countOverdueFollowUps(commercialId: string): Promise<number> {
    return this.followUpRepo
      .createQueryBuilder('f')
      .where('f.commercial_id = :id', { id: commercialId })
      .andWhere('f.status = :status', { status: FollowUpStatus.PLANIFIEE })
      .andWhere('f.scheduled_at < :now', { now: new Date() })
      .andWhere('f.deleted_at IS NULL')
      .getCount();
  }

  private async countPriorityConvs(posteId: string | null, commercialId: string): Promise<number> {
    const qb = this.chatRepo
      .createQueryBuilder('c')
      .where('c.is_priority = 1')
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.status != :closed', { closed: WhatsappChatStatus.FERME });

    if (posteId) {
      qb.andWhere('c.poste_id = :posteId', { posteId });
    }

    return qb.getCount();
  }
}
