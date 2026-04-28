import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationReport, NextAction } from './entities/conversation-report.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactPhone } from 'src/client-dossier/entities/contact-phone.entity';
import { ClientDossier } from 'src/client-dossier/entities/client-dossier.entity';
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
    @InjectRepository(ClientDossier)
    private readonly dossierRepo: Repository<ClientDossier>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly outboxService: IntegrationOutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly followUpService: FollowUpService,
  ) {}

  async submitReport(chatId: string, commercialId: string): Promise<SubmissionResult> {
    let report = await this.reportRepo.findOne({ where: { chatId } });

    // ── Fallback : créer ConversationReport depuis ClientDossier si absent ────
    if (!report) {
      const contact = await this.contactRepo.findOne({ where: { chat_id: chatId }, select: ['id'] });
      const dossier = contact
        ? await this.dossierRepo.findOne({ where: { contactId: contact.id } })
        : null;

      if (!dossier || !(dossier.fullName?.trim() && dossier.clientNeed?.trim() && dossier.interestScore !== null)) {
        throw new BadRequestException('Rapport incomplet — renseignez le nom client, le besoin et le score d\'intérêt');
      }

      report = this.reportRepo.create({
        chatId,
        commercialId,
        clientName:          dossier.fullName,
        ville:               dossier.ville,
        commune:             dossier.commune,
        quartier:            dossier.quartier,
        productCategory:     dossier.productCategory,
        clientNeed:          dossier.clientNeed,
        interestScore:       dossier.interestScore,
        isMaleNotInterested: dossier.isMaleNotInterested,
        followUpAt:          dossier.followUpAt,
        nextAction:          (dossier.nextAction as NextAction | null) ?? null,
        notes:               dossier.notes,
        isComplete:          true,
      });
      await this.reportRepo.save(report);
    }

    if (!report.isComplete) {
      throw new BadRequestException('Rapport incomplet — renseignez le nom client, le besoin et le score d\'intérêt');
    }

    const isFirstSubmission = !report.isSubmitted;

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

    // Payload complet pour le worker outbox (capturé au moment de la soumission)
    const outboxPayload = {
      messagingChatId:        chatId,
      commercialIdDb1:        commercialId,
      contactIdDb1:           contact?.id ?? null,
      clientMessagingContact: chat?.contact_client ?? null,
      clientPhones:           clientPhonesJson,
      clientName:             report.clientName,
      commercialName:         commercial?.name ?? null,
      commercialPhone:        commercial?.phone ?? null,
      commercialEmail:        commercial?.email ?? null,
      ville:                  report.ville,
      commune:                report.commune,
      quartier:               report.quartier,
      productCategory:        report.productCategory,
      clientNeed:             report.clientNeed,
      interestScore:          report.interestScore,
      nextAction:             report.nextAction ?? null,
      followUpAt:             report.followUpAt ?? null,
      notes:                  report.notes ?? null,
    };

    // ── E02-T02 : persistance atomique rapport + outbox ───────────────────────
    // Les deux writes se font dans la même transaction DB1 :
    // si l'une échoue, aucune n'est persistée.
    await this.reportRepo.manager.transaction(async (manager) => {
      if (isFirstSubmission) {
        report!.isSubmitted  = true;
        report!.submittedAt  = new Date();
      }
      report!.submissionStatus = 'pending';
      await manager.save(ConversationReport, report!);
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

    // ── Créer/mettre à jour la relance si followUpAt renseigné ───────────────
    if (isFirstSubmission && report.followUpAt && contact?.id) {
      try {
        await this.followUpService.upsertFromDossierOrReport({
          contact_id:      contact.id,
          conversation_id: chat?.id ?? null,
          commercial_id:   commercialId,
          commercial_name: commercial?.name ?? null,
          scheduled_at:    report.followUpAt,
          next_action:     report.nextAction ?? null,
          notes:           report.notes ?? null,
        });
      } catch (err) {
        this.logger.warn(`follow-up upsert échoué chat=${chatId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`REPORT_SUBMITTED chat=${chatId} → outbox enqueued (worker prendra en charge DB2 sync)`);

    return {
      status:      'pending',
      submittedAt: report.submittedAt ?? null,
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
    const report = await this.reportRepo.findOne({
      where: { chatId },
      select: ['chatId', 'commercialId', 'isComplete', 'isSubmitted', 'submissionStatus'],
    });
    if (!report) throw new NotFoundException(`Rapport introuvable pour la conversation ${chatId}`);
    if (!report.commercialId) throw new BadRequestException('Aucun commercial associé au rapport — relance impossible');
    return this.submitReport(chatId, report.commercialId);
  }

  /** Fallback legacy : retry des rapports en échec avant l'introduction de l'outbox. */
  @Cron('0 * * * *')
  async autoRetryFailedReports(): Promise<void> {
    const failed = await this.getFailedReports(20);
    if (failed.length === 0) return;
    this.logger.log(`Legacy auto-retry: ${failed.length} rapport(s) en échec`);
    for (const r of failed) {
      try {
        await this.retryReport(r.chatId);
      } catch (err) {
        this.logger.warn(`Legacy auto-retry échoué chat=${r.chatId}: ${(err as Error).message}`);
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
      chatId:          r.chatId,
      clientName:      r.clientName,
      submissionError: r.submissionError,
      updatedAt:       r.updatedAt,
    }));
  }
}
