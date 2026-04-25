import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationReport } from './entities/conversation-report.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactPhone } from 'src/client-dossier/entities/contact-phone.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
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
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly mirrorService: OrderDossierMirrorWriteService,
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
        select: ['contact_client'],
      }),
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
      report.submittedAt      = now;
      report.submissionError  = null;
      this.eventEmitter.emit('conversation.report.submitted', { chatId, commercialId });
      this.logger.log(`Rapport soumis en DB2 mirror: chat=${chatId}`);
    } catch (err) {
      report.submissionStatus = 'failed';
      report.submittedAt      = null;
      report.submissionError  = (err as Error).message;
      this.logger.error(`Soumission DB2 échouée chat=${chatId}: ${(err as Error).message}`);
    }

    await this.reportRepo.save(report);

    return {
      status:     report.submissionStatus,
      submittedAt: report.submittedAt,
      error:      report.submissionError,
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
