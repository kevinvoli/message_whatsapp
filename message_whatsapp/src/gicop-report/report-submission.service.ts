import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationReport } from './entities/conversation-report.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { OrderPlatformSyncService } from './order-platform-sync.service';

export interface SubmissionResult {
  status: 'sent' | 'failed';
  submittedAt: Date | null;
  error: string | null;
}

@Injectable()
export class ReportSubmissionService {
  private readonly logger = new Logger(ReportSubmissionService.name);

  constructor(
    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    private readonly syncService: OrderPlatformSyncService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submitReport(chatId: string, commercialId: string): Promise<SubmissionResult> {
    const report = await this.reportRepo.findOne({ where: { chatId } });
    if (!report) throw new NotFoundException(`Rapport introuvable pour la conversation ${chatId}`);

    if (!report.isComplete) {
      throw new BadRequestException('Rapport incomplet — renseignez le nom client, le besoin et le score d\'intérêt');
    }

    // Marquer pending
    report.submissionStatus = 'pending';
    await this.reportRepo.save(report);

    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId },
      select: ['name', 'phone', 'email'],
    });

    const now = new Date();
    const result = await this.syncService.send({
      chat_id:          chatId,
      commercial_name:  commercial?.name ?? 'Inconnu',
      commercial_phone: commercial?.phone ?? null,
      commercial_email: commercial?.email ?? null,
      client_name:      report.clientName,
      ville:            report.ville,
      commune:          report.commune,
      quartier:         report.quartier,
      product_category: report.productCategory,
      client_need:      report.clientNeed,
      interest_score:   report.interestScore,
      next_action:      report.nextAction,
      follow_up_at:     report.followUpAt?.toISOString() ?? null,
      notes:            report.notes,
      submitted_at:     now.toISOString(),
    });

    report.submissionStatus = result.ok ? 'sent' : 'failed';
    report.submittedAt      = result.ok ? now : null;
    report.submissionError  = result.error ?? null;
    await this.reportRepo.save(report);

    if (result.ok) {
      this.eventEmitter.emit('conversation.report.submitted', { chatId, commercialId });
    }

    this.logger.log(
      `Soumission rapport chat=${chatId} commercial=${commercialId} → ${result.ok ? 'OK' : 'ÉCHEC: ' + result.error}`,
    );

    return {
      status: report.submissionStatus,
      submittedAt: report.submittedAt,
      error: report.submissionError,
    };
  }

  async getSubmissionStatus(chatId: string): Promise<{ status: string | null; submittedAt: Date | null; error: string | null }> {
    const report = await this.reportRepo.findOne({
      where: { chatId },
      select: ['submissionStatus', 'submittedAt', 'submissionError'],
    });
    return {
      status: report?.submissionStatus ?? null,
      submittedAt: report?.submittedAt ?? null,
      error: report?.submissionError ?? null,
    };
  }

  async retryReport(chatId: string): Promise<SubmissionResult> {
    const report = await this.reportRepo.findOne({
      where: { chatId },
      select: ['chatId', 'commercialId', 'isComplete', 'submissionStatus'],
    });
    if (!report) throw new NotFoundException(`Rapport introuvable pour la conversation ${chatId}`);
    if (!report.commercialId) throw new BadRequestException('Aucun commercial associé au rapport — relance impossible');
    return this.submitReport(chatId, report.commercialId);
  }

  @Cron('0 * * * *')
  async autoRetryFailedReports(): Promise<void> {
    const failed = await this.getFailedReports(20);
    if (failed.length === 0) return;
    this.logger.log(`Auto-retry: ${failed.length} rapport(s) en échec à relancer`);
    for (const r of failed) {
      try {
        await this.retryReport(r.chatId);
      } catch (err) {
        this.logger.warn(`Auto-retry échoué chat=${r.chatId}: ${(err as Error).message}`);
      }
    }
  }

  async getFailedReports(limit = 50): Promise<Array<{
    chatId: string;
    clientName: string | null;
    submissionError: string | null;
    updatedAt: Date;
  }>> {
    const reports = await this.reportRepo.find({
      where: { submissionStatus: 'failed' },
      order: { updatedAt: 'DESC' },
      take: limit,
      select: ['chatId', 'clientName', 'submissionError', 'updatedAt'],
    });
    return reports.map((r) => ({
      chatId: r.chatId,
      clientName: r.clientName,
      submissionError: r.submissionError,
      updatedAt: r.updatedAt,
    }));
  }
}
