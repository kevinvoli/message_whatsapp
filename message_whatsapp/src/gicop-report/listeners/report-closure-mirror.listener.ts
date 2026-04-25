import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationReport } from '../entities/conversation-report.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactPhone } from 'src/client-dossier/entities/contact-phone.entity';
import { ClientDossier } from 'src/client-dossier/entities/client-dossier.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
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

    @InjectRepository(ContactPhone)
    private readonly phoneRepo: Repository<ContactPhone>,

    @InjectRepository(ClientDossier)
    private readonly dossierRepo: Repository<ClientDossier>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    private readonly mirrorService: OrderDossierMirrorWriteService,
  ) {}

  @OnEvent('conversation.closed', { async: true })
  async handle(payload: ConversationClosedPayload): Promise<void> {
    try {
      const [report, commercial, contact, chat] = await Promise.all([
        this.reportRepo.findOne({ where: { chatId: payload.chatId } }),
        this.commercialRepo.findOne({
          where:  { id: payload.commercialId },
          select: ['name', 'phone', 'email'],
        }),
        this.contactRepo.findOne({
          where:  { chat_id: payload.chatId },
          select: ['id', 'phone'],
        }),
        this.chatRepo.findOne({
          where:  { chat_id: payload.chatId },
          select: ['contact_client'],
        }),
      ]);

      // Charger dossier client + téléphones associés (dépendent de contact.id)
      const [dossier, extraPhones] = await Promise.all([
        contact ? this.dossierRepo.findOne({ where: { contactId: contact.id } }) : null,
        contact ? this.phoneRepo.find({ where: { contactId: contact.id } }) : [],
      ]);

      // Construire la liste complète des téléphones (principal + associés)
      const allPhones = [
        ...(contact?.phone ? [{ phone: contact.phone, label: 'Principal', isPrimary: true }] : []),
        ...extraPhones.map((p) => ({ phone: p.phone, label: p.label, isPrimary: p.isPrimary })),
      ];
      const clientPhonesJson = allPhones.length > 0 ? JSON.stringify(allPhones) : null;

      // Prioriser ClientDossier (source de vérité commerciale)
      // Fallback sur ConversationReport si dossier absent
      await this.mirrorService.upsertDossier({
        messagingChatId:        payload.chatId,
        commercialIdDb1:        payload.commercialId,
        contactIdDb1:           contact?.id ?? null,
        clientMessagingContact: chat?.contact_client ?? null,
        clientPhones:           clientPhonesJson,
        clientName:             dossier?.fullName      ?? report?.clientName      ?? null,
        commercialName:         commercial?.name       ?? null,
        commercialPhone:        commercial?.phone      ?? null,
        commercialEmail:        commercial?.email      ?? null,
        ville:                  dossier?.ville         ?? report?.ville           ?? null,
        commune:                dossier?.commune       ?? report?.commune         ?? null,
        quartier:               dossier?.quartier      ?? report?.quartier        ?? null,
        productCategory:        dossier?.productCategory ?? report?.productCategory ?? null,
        clientNeed:             dossier?.clientNeed    ?? report?.clientNeed      ?? null,
        interestScore:          dossier?.interestScore ?? report?.interestScore   ?? null,
        nextAction:             dossier?.nextAction    ?? report?.nextAction      ?? null,
        followUpAt:             dossier?.followUpAt    ?? report?.followUpAt      ?? null,
        notes:                  dossier?.notes         ?? report?.notes           ?? null,
        conversationResult:     payload.conversationResult,
        closedAt:               payload.closedAt,
      });

      this.logger.log(`Dossier miroir DB2 synchronisé après fermeture: chat=${payload.chatId}`);
    } catch (err) {
      this.logger.error(
        `Erreur sync miroir DB2 après fermeture chat=${payload.chatId}: ${(err as Error).message}`,
      );
    }
  }
}
