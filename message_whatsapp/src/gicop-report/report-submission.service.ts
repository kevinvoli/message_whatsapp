import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationReport, NextAction } from './entities/conversation-report.entity';
import { UpsertReportDto } from './conversation-report.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactPhone } from 'src/client-dossier/entities/contact-phone.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { IntegrationOutboxService } from 'src/integration-outbox/integration-outbox.service';
import { FollowUpService } from 'src/follow-up/follow_up.service';

export interface SubmissionResult {
  status: 'sent' | 'pending' | 'failed';
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
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(ContactPhone)
    private readonly phoneRepo: Repository<ContactPhone>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly outboxService: IntegrationOutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly followUpService: FollowUpService,
  ) {}

  async submitReport(chatId: string, commercialId: string, dto: UpsertReportDto): Promise<SubmissionResult> {
    const clientName    = dto.clientName ?? null;
    const clientNeed    = dto.clientNeed ?? null;
    const interestScore = dto.interestScore ?? null;

    if (!clientName?.trim() || !clientNeed?.trim() || interestScore === null) {
      throw new BadRequestException('Rapport incomplet — renseignez le nom client, le besoin et le score d\'intérêt');
    }

    // Détecter si c'est la première soumission pour ce chat (pour les événements métier)
    const existing = await this.reportRepo.findOne({
      where:  { chatId },
      select: ['id', 'isSubmitted'],
    });
    const isFirstSubmission = !existing?.isSubmitted;

    // ── Charger les données associées pour le payload outbox ─────────────────
    const [commercial, contact, chat] = await Promise.all([
      this.commercialRepo.findOne({ where: { id: commercialId }, select: ['name', 'phone', 'email'] }),
      this.contactRepo.findOne({ where: { chat_id: chatId }, select: ['id', 'phone'] }),
      this.chatRepo.findOne({ where: { chat_id: chatId }, select: ['id', 'contact_client', 'poste_id'] }),
    ]);

    const extraPhones = contact
      ? await this.phoneRepo.find({ where: { contactId: contact.id } })
      : [];
    const allPhones = [
      ...(contact?.phone ? [{ phone: contact.phone, label: 'Principal', isPrimary: true }] : []),
      ...extraPhones.map((p) => ({ phone: p.phone, label: p.label, isPrimary: p.isPrimary })),
    ];
    const clientPhonesJson = allPhones.length > 0 ? JSON.stringify(allPhones) : null;

    const now = new Date();

    // Construire le nouvel enregistrement depuis les données soumises
    const newReport = this.reportRepo.create({
      chatId,
      commercialId,
      posteId:             chat?.poste_id ?? null,
      clientName,
      ville:               dto.ville               ?? null,
      commune:             dto.commune             ?? null,
      quartier:            dto.quartier            ?? null,
      productCategory:     dto.productCategory     ?? null,
      clientNeed,
      interestScore,
      isMaleNotInterested: dto.isMaleNotInterested ?? false,
      followUpAt:          dto.followUpAt ? new Date(dto.followUpAt) : null,
      nextAction:          (dto.nextAction as NextAction | null) ?? null,
      notes:               dto.notes               ?? null,
      isComplete:          true,
      isSubmitted:         true,
      submittedAt:         now,
      submissionStatus:    'pending',
    });

    const outboxPayload = {
      messagingChatId:        chatId,
      commercialIdDb1:        commercialId,
      contactIdDb1:           contact?.id ?? null,
      clientMessagingContact: chat?.contact_client ?? null,
      clientPhones:           clientPhonesJson,
      clientName:             newReport.clientName,
      commercialName:         commercial?.name ?? null,
      commercialPhone:        commercial?.phone ?? null,
      commercialEmail:        commercial?.email ?? null,
      ville:                  newReport.ville,
      commune:                newReport.commune,
      quartier:               newReport.quartier,
      productCategory:        newReport.productCategory,
      clientNeed:             newReport.clientNeed,
      interestScore:          newReport.interestScore,
      nextAction:             newReport.nextAction ?? null,
      followUpAt:             newReport.followUpAt ?? null,
      notes:                  newReport.notes ?? null,
    };

    // ── Suppression de l'ancien + insertion du nouveau en transaction atomique ─
    // Garantit createdAt = updatedAt = submittedAt = now pour chaque soumission.
    await this.reportRepo.manager.transaction(async (manager) => {
      if (existing) {
        await manager.delete(ConversationReport, { chatId });
      }
      await manager.save(ConversationReport, newReport);
      await this.outboxService.enqueue('REPORT_SUBMITTED', chatId, outboxPayload, manager);
    });

    // ── Émettre les événements métier (hors transaction) ─────────────────────
    if (isFirstSubmission) {
      this.eventEmitter.emit('conversation.report.submitted', {
        chatId,
        commercialId,
        posteId: chat?.poste_id ?? null,
      });
    }
    if (chat?.poste_id) {
      this.eventEmitter.emit('conversation.result_set', { chatId, posteId: chat.poste_id });
    }

    if (newReport.followUpAt && contact?.id) {
      try {
        await this.followUpService.upsertFromDossierOrReport({
          contact_id:      contact.id,
          conversation_id: chat?.id ?? null,
          commercial_id:   commercialId,
          commercial_name: commercial?.name ?? null,
          scheduled_at:    newReport.followUpAt,
          next_action:     newReport.nextAction ?? null,
          notes:           newReport.notes ?? null,
        });
      } catch (err) {
        this.logger.warn(`follow-up upsert échoué chat=${chatId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`REPORT_SUBMITTED chat=${chatId} → nouvel enregistrement créé, outbox enqueued`);

    return {
      status:      'pending',
      submittedAt: now,
      error:       null,
    };
  }

  async getSubmissionStatus(chatId: string): Promise<{ status: string | null; submittedAt: Date | null; error: string | null }> {
    const report = await this.reportRepo.findOne({
      where: { chatId },
      select: ['isSubmitted', 'submissionStatus', 'submittedAt', 'submissionError'],
    });
    return {
      status:      report?.submissionStatus ?? null,
      submittedAt: report?.submittedAt ?? null,
      error:       report?.submissionStatus === 'failed' ? (report?.submissionError ?? null) : null,
    };
  }

  async retryReport(chatId: string): Promise<SubmissionResult> {
    const report = await this.reportRepo.findOne({ where: { chatId } });
    if (!report) throw new NotFoundException(`Rapport introuvable pour la conversation ${chatId}`);
    if (!report.commercialId) throw new BadRequestException('Aucun commercial associé au rapport — relance impossible');
    return this.submitReport(chatId, report.commercialId, {
      clientName:          report.clientName,
      ville:               report.ville,
      commune:             report.commune,
      quartier:            report.quartier,
      productCategory:     report.productCategory,
      clientNeed:          report.clientNeed,
      interestScore:       report.interestScore,
      isMaleNotInterested: report.isMaleNotInterested,
      followUpAt:          report.followUpAt?.toISOString() ?? null,
      nextAction:          report.nextAction,
      notes:               report.notes,
    });
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
      chatId:          r.chatId,
      clientName:      r.clientName,
      submissionError: r.submissionError,
      updatedAt:       r.updatedAt,
    }));
  }
}
