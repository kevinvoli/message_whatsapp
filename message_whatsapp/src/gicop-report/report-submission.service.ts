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
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { OrderDossierMirrorWriteService } from 'src/order-write/services/order-dossier-mirror-write.service';

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
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(ContactPhone)
    private readonly phoneRepo: Repository<ContactPhone>,
    @InjectRepository(ClientDossier)
    private readonly dossierRepo: Repository<ClientDossier>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly mirrorService: OrderDossierMirrorWriteService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submitReport(chatId: string, commercialId: string): Promise<SubmissionResult> {
    let report = await this.reportRepo.findOne({ where: { chatId } });

    // ── Fallback : créer ConversationReport depuis ClientDossier si absent ────
    // Cela arrive quand le commercial a sauvegardé avant le déploiement du fix
    // qui synchronise les deux tables lors de la sauvegarde.
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

    // ── Marquer soumis côté commercial (indépendant du DB2) ──────────────────
    if (isFirstSubmission) {
      report.isSubmitted     = true;
      report.submittedAt     = new Date();
    }
    report.submissionStatus = 'pending';
    await this.reportRepo.save(report);

    // ── Charger les données associées ────────────────────────────────────────
    const [commercial, contact, chat] = await Promise.all([
      this.commercialRepo.findOne({
        where:  { id: commercialId },
        select: ['name', 'phone', 'email'],
      }),
      this.contactRepo.findOne({
        where:  { chat_id: chatId },
        select: ['id', 'phone'],
      }),
      this.chatRepo.findOne({
        where:  { chat_id: chatId },
        select: ['contact_client', 'poste_id', 'status'],
      }),
    ]);

    // ── Auto-fermeture à la première soumission ──────────────────────────────
    // La conversation disparaît du bandeau commercial sans action manuelle.
    if (isFirstSubmission && chat?.poste_id && chat.status !== WhatsappChatStatus.FERME) {
      await this.chatRepo.update({ chat_id: chatId }, { status: WhatsappChatStatus.FERME });
      this.eventEmitter.emit('conversation.closed', {
        chatId,
        commercialId,
        posteId: chat.poste_id,
        conversationResult: null,
        closedAt: new Date(),
      });
    }

    // ── Émettre les événements (sans attendre DB2) ──────────────────────────
    // conversation.report.submitted : une seule fois (portefeuille, publisher).
    // conversation.result_set       : à chaque soumission — idempotent côté
    //   validation, mais permet de relancer le checkAndTriggerRotation même
    //   en cas de re-soumission ou si la rotation a échoué silencieusement.
    if (isFirstSubmission) {
      this.eventEmitter.emit('conversation.report.submitted', {
        chatId,
        commercialId,
        posteId: chat?.poste_id ?? null,
      });
    }
    if (chat?.poste_id) {
      this.eventEmitter.emit('conversation.result_set', {
        chatId,
        posteId: chat.poste_id,
      });
    }

    // ── Tentative de sync DB2 (non-bloquante pour le commercial) ─────────────
    const extraPhones = contact
      ? await this.phoneRepo.find({ where: { contactId: contact.id } })
      : [];
    const allPhones = [
      ...(contact?.phone ? [{ phone: contact.phone, label: 'Principal', isPrimary: true }] : []),
      ...extraPhones.map((p) => ({ phone: p.phone, label: p.label, isPrimary: p.isPrimary })),
    ];
    const clientPhonesJson = allPhones.length > 0 ? JSON.stringify(allPhones) : null;

    try {
      await this.mirrorService.upsertDossier({
        messagingChatId:        chatId,
        commercialIdDb1:        commercialId,
        contactIdDb1:           contact?.id ?? null,
        clientMessagingContact: chat?.contact_client ?? null,
        clientPhones:           clientPhonesJson,
        clientName:       report.clientName,
        commercialName:   commercial?.name ?? null,
        commercialPhone:  commercial?.phone ?? null,
        commercialEmail:  commercial?.email ?? null,
        ville:            report.ville,
        commune:          report.commune,
        quartier:         report.quartier,
        productCategory:  report.productCategory,
        clientNeed:       report.clientNeed,
        interestScore:    report.interestScore,
        nextAction:       report.nextAction ?? null,
        followUpAt:       report.followUpAt,
        notes:            report.notes,
      });
      report.submissionStatus = 'sent';
      report.submissionError  = null;
      this.logger.log(`Dossier miroir DB2 sync OK: chat=${chatId}`);
    } catch (err) {
      // DB2 indisponible : on met en file d'attente pour le retry automatique (cron horaire).
      // Le rapport reste "soumis" du point de vue du commercial.
      report.submissionStatus = 'failed';
      report.submissionError  = (err as Error).message;
      this.logger.warn(`DB2 indisponible — rapport en file d'attente (retry auto): chat=${chatId}: ${(err as Error).message}`);
    }

    await this.reportRepo.save(report);

    return {
      status:      report.submissionStatus ?? 'failed',
      submittedAt: report.submittedAt,
      error:       report.submissionStatus === 'failed' ? report.submissionError : null,
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
