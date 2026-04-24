import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationReport } from '../entities/conversation-report.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { OrderDossierMirrorWriteService } from 'src/order-write/services/order-dossier-mirror-write.service';

interface ConversationClosedPayload {
  chatId:             string;
  commercialId:       string;
  conversationResult: string | null;
  closedAt:           Date;
}

/**
 * Écoute `conversation.closed` et synchronise le dossier complet en DB2 mirror.
 * Fire-and-forget : les erreurs sont loguées mais ne bloquent pas la fermeture.
 */
@Injectable()
export class ReportClosureMirrorListener {
  private readonly logger = new Logger(ReportClosureMirrorListener.name);

  constructor(
    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,

    private readonly mirrorService: OrderDossierMirrorWriteService,
  ) {}

  @OnEvent('conversation.closed', { async: true })
  async handle(payload: ConversationClosedPayload): Promise<void> {
    try {
      const [report, commercial, contact] = await Promise.all([
        this.reportRepo.findOne({ where: { chatId: payload.chatId } }),
        this.commercialRepo.findOne({
          where:  { id: payload.commercialId },
          select: ['name', 'phone', 'email'],
        }),
        this.contactRepo.findOne({
          where:  { chat_id: payload.chatId },
          select: ['id'],
        }),
      ]);

      await this.mirrorService.upsertDossier({
        messagingChatId:  payload.chatId,
        commercialIdDb1:  payload.commercialId,
        contactIdDb1:     contact?.id ?? null,   // Contact.id (UUID) → ClientIdentityMapping → id_client DB2
        clientName:       report?.clientName ?? null,
        commercialName:   commercial?.name ?? null,
        commercialPhone:  commercial?.phone ?? null,
        commercialEmail:  commercial?.email ?? null,
        ville:            report?.ville ?? null,
        commune:          report?.commune ?? null,
        quartier:         report?.quartier ?? null,
        productCategory:  report?.productCategory ?? null,
        clientNeed:       report?.clientNeed ?? null,
        interestScore:    report?.interestScore ?? null,
        nextAction:       report?.nextAction ?? null,
        followUpAt:       report?.followUpAt ?? null,
        notes:            report?.notes ?? null,
        conversationResult: payload.conversationResult,
        closedAt:         payload.closedAt,
      });

      this.logger.log(`Dossier miroir DB2 synchronisé après fermeture: chat=${payload.chatId}`);
    } catch (err) {
      this.logger.error(
        `Erreur sync miroir DB2 après fermeture chat=${payload.chatId}: ${(err as Error).message}`,
      );
    }
  }
}
