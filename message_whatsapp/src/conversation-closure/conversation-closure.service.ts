import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappChat, WhatsappChatStatus, ConversationResult } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationReport } from 'src/gicop-report/entities/conversation-report.entity';
import { FollowUp, FollowUpStatus } from 'src/follow-up/entities/follow_up.entity';
import { ClosureAttemptLog } from './entities/closure-attempt-log.entity';

export enum ClosureBlockCode {
  RAPPORT_INCOMPLET            = 'RAPPORT_INCOMPLET',
  RESULTAT_MANQUANT            = 'RESULTAT_MANQUANT',
  PROCHAINE_ACTION_MANQUANTE   = 'PROCHAINE_ACTION_MANQUANTE',
  RELANCE_REQUISE              = 'RELANCE_REQUISE',
  DOSSIER_INCOMPLET            = 'DOSSIER_INCOMPLET',
}

export interface ClosureBlocker {
  code: ClosureBlockCode;
  label: string;
  severity: 'error' | 'warning';
}

export interface ClosureReadiness {
  ok: boolean;
  blockers: ClosureBlocker[];
}

@Injectable()
export class ConversationClosureService {
  private readonly logger = new Logger(ConversationClosureService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    @InjectRepository(ClosureAttemptLog)
    private readonly logRepo: Repository<ClosureAttemptLog>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async validateClosure(chatId: string, commercialId?: string, logAttempt = true): Promise<ClosureReadiness> {
    const blockers: ClosureBlocker[] = [];

    const [chat, report] = await Promise.all([
      this.chatRepo.findOne({ where: { chat_id: chatId } }),
      this.reportRepo.findOne({ where: { chatId } }),
    ]);

    if (!report?.isComplete) {
      blockers.push({
        code: ClosureBlockCode.RAPPORT_INCOMPLET,
        label: 'Le rapport GICOP doit être complété (nom client, besoin, score d\'intérêt)',
        severity: 'error',
      });
    }

    if (chat && !chat.conversation_result) {
      blockers.push({
        code: ClosureBlockCode.RESULTAT_MANQUANT,
        label: 'Le résultat de la conversation doit être renseigné',
        severity: 'error',
      });
    }

    if (report && !report.nextAction) {
      blockers.push({
        code: ClosureBlockCode.PROCHAINE_ACTION_MANQUANTE,
        label: 'La prochaine action doit être renseignée dans le rapport',
        severity: 'error',
      });
    }

    // Relance obligatoire si l'action suivante implique un suivi
    if (report?.nextAction && ['relancer', 'rappeler'].includes(report.nextAction)) {
      const chatEntity = chat ?? await this.chatRepo.findOne({ where: { chat_id: chatId } });
      if (chatEntity) {
        const hasRelance = await this.followUpRepo.findOne({
          where: [
            { conversation_id: chatEntity.id, status: FollowUpStatus.PLANIFIEE },
            { conversation_id: chatEntity.id, status: FollowUpStatus.EN_RETARD },
          ],
        });
        if (!hasRelance) {
          blockers.push({
            code: ClosureBlockCode.RELANCE_REQUISE,
            label: `La prochaine action "${report.nextAction}" nécessite une relance planifiée`,
            severity: 'error',
          });
        }
      }
    }

    const ok = blockers.length === 0;

    if (logAttempt) {
      void this.logAttempt(chatId, commercialId ?? null, blockers, !ok);
    }

    return { ok, blockers };
  }

  async closeConversation(chatId: string, commercialId: string): Promise<{ ok: boolean }> {
    const readiness = await this.validateClosure(chatId, commercialId, false);
    if (!readiness.ok) {
      throw new BadRequestException({ message: 'Fermeture bloquée', blockers: readiness.blockers });
    }

    // Charger le résultat de conversation avant la fermeture (pour le payload d'événement)
    const chat = await this.chatRepo.findOne({
      where:  { chat_id: chatId },
      select: ['conversation_result'],
    });

    await this.chatRepo.update({ chat_id: chatId }, { status: WhatsappChatStatus.FERME });
    void this.logAttempt(chatId, commercialId, [], false);

    const closedAt = new Date();
    this.eventEmitter.emit('conversation.closed', {
      chatId,
      commercialId,
      conversationResult: chat?.conversation_result ?? null,
      closedAt,
    });

    this.logger.log(`Conversation fermée: chat=${chatId} commercial=${commercialId}`);
    return { ok: true };
  }

  async getClosureStats(limit = 100): Promise<{
    blockedCount: number;
    blockerSummary: Record<string, number>;
    recentAttempts: Array<{
      chatId: string;
      commercialId: string | null;
      blockers: object | null;
      createdAt: Date;
    }>;
  }> {
    const attempts = await this.logRepo.find({
      where: { wasBlocked: 1 },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const blockerSummary: Record<string, number> = {};
    for (const attempt of attempts) {
      const list = (attempt.blockers as Array<{ code: string }>) ?? [];
      for (const b of list) {
        blockerSummary[b.code] = (blockerSummary[b.code] ?? 0) + 1;
      }
    }

    return {
      blockedCount: attempts.length,
      blockerSummary,
      recentAttempts: attempts.map((a) => ({
        chatId: a.chatId,
        commercialId: a.commercialId,
        blockers: a.blockers,
        createdAt: a.createdAt,
      })),
    };
  }

  private async logAttempt(
    chatId: string,
    commercialId: string | null,
    blockers: ClosureBlocker[],
    wasBlocked: boolean,
  ): Promise<void> {
    try {
      await this.logRepo.save(
        this.logRepo.create({
          id: uuidv4(),
          chatId,
          commercialId,
          blockers: blockers as unknown as object,
          wasBlocked: wasBlocked ? 1 : 0,
        }),
      );
    } catch (err) {
      this.logger.warn(`Erreur log fermeture chat=${chatId}: ${(err as Error).message}`);
    }
  }

  /** Vérifie si la conversation est déjà fermée ou convertie */
  async isAlreadyClosed(chatId: string): Promise<boolean> {
    const chat = await this.chatRepo.findOne({
      where: { chat_id: chatId },
      select: ['status'],
    });
    return chat?.status === WhatsappChatStatus.FERME;
  }

  /** Pour les résultats qui ne nécessitent pas de relance */
  static readonly RESULTS_WITHOUT_FOLLOWUP: ConversationResult[] = [
    ConversationResult.PAS_INTERESSE,
    ConversationResult.SANS_REPONSE,
    ConversationResult.ANNULE,
  ];
}
