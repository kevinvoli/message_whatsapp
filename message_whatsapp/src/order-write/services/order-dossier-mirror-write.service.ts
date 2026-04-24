import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from 'src/order-db/order-db.constants';
import { MessagingClientDossierMirror } from '../entities/messaging-client-dossier-mirror.entity';
import { IntegrationSyncLogService } from 'src/integration-sync/integration-sync-log.service';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';

export interface DossierMirrorPayload {
  messagingChatId:    string;
  /** UUID DB1 du commercial — résolu en int DB2 via mapping. */
  commercialIdDb1?:   string | null;
  /** UUID DB1 du contact — résolu en int DB2 via mapping. */
  contactIdDb1?:      string | null;
  clientName?:        string | null;
  commercialName?:    string | null;
  commercialPhone?:   string | null;
  commercialEmail?:   string | null;
  ville?:             string | null;
  commune?:           string | null;
  quartier?:          string | null;
  productCategory?:   string | null;
  clientNeed?:        string | null;
  interestScore?:     number | null;
  nextAction?:        string | null;
  followUpAt?:        Date | null;
  notes?:             string | null;
  conversationResult?: string | null;
  closedAt?:          Date | null;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS messaging_client_dossier_mirror (
  messaging_chat_id  VARCHAR(100) NOT NULL,
  id_client          INT          DEFAULT NULL,
  id_commercial      INT          DEFAULT NULL,
  client_name        VARCHAR(200) DEFAULT NULL,
  commercial_name    VARCHAR(200) DEFAULT NULL,
  commercial_phone   VARCHAR(30)  DEFAULT NULL,
  commercial_email   VARCHAR(200) DEFAULT NULL,
  ville              VARCHAR(100) DEFAULT NULL,
  commune            VARCHAR(100) DEFAULT NULL,
  quartier           VARCHAR(100) DEFAULT NULL,
  product_category   VARCHAR(200) DEFAULT NULL,
  client_need        TEXT         DEFAULT NULL,
  interest_score     TINYINT      DEFAULT NULL,
  next_action        VARCHAR(50)  DEFAULT NULL,
  follow_up_at       DATETIME     DEFAULT NULL,
  notes              TEXT         DEFAULT NULL,
  conversation_result VARCHAR(50) DEFAULT NULL,
  closed_at          DATETIME     DEFAULT NULL,
  sync_status        ENUM('pending','synced','error') DEFAULT 'pending',
  sync_error         TEXT         DEFAULT NULL,
  submitted_at       DATETIME     DEFAULT NULL,
  updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (messaging_chat_id),
  KEY IDX_mirror_id_client     (id_client),
  KEY IDX_mirror_id_commercial (id_commercial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

@Injectable()
export class OrderDossierMirrorWriteService implements OnModuleInit {
  private readonly logger = new Logger(OrderDossierMirrorWriteService.name);

  constructor(
    @Inject(ORDER_DB_DATA_SOURCE)
    private readonly orderDb: DataSource | null,

    @Inject(ORDER_DB_AVAILABLE)
    private readonly dbAvailable: boolean,

    private readonly syncLog: IntegrationSyncLogService,

    @InjectRepository(CommercialIdentityMapping)
    private readonly commercialMappingRepo: Repository<CommercialIdentityMapping>,

    @InjectRepository(ClientIdentityMapping)
    private readonly clientMappingRepo: Repository<ClientIdentityMapping>,
  ) {}

  /** Crée la table miroir dans DB2 au démarrage si elle n'existe pas. */
  async onModuleInit(): Promise<void> {
    if (!this.orderDb) return;
    try {
      await this.orderDb.query(CREATE_TABLE_SQL);
      this.logger.log('Table messaging_client_dossier_mirror vérifiée/créée dans DB2');
    } catch (err) {
      this.logger.error(`Impossible de créer la table miroir DB2: ${(err as Error).message}`);
    }
  }

  /**
   * Upsert du dossier client dans la table miroir DB2.
   * Idempotent : un double appel ne crée pas de doublon.
   */
  async upsertDossier(payload: DossierMirrorPayload): Promise<void> {
    if (!this.orderDb) {
      this.logger.warn(`DB2 non disponible — dossier ${payload.messagingChatId} non synchronisé`);
      return;
    }

    const logEntry = await this.syncLog.createPending(
      'client_dossier',
      payload.messagingChatId,
      'messaging_client_dossier_mirror',
    );

    try {
      const [idCommercial, idClient] = await Promise.all([
        payload.commercialIdDb1
          ? this.resolveCommercial(payload.commercialIdDb1)
          : null,
        payload.contactIdDb1
          ? this.resolveClient(payload.contactIdDb1)
          : null,
      ]);

      const row: Partial<MessagingClientDossierMirror> = {
        messagingChatId:    payload.messagingChatId,
        idClient:           idClient ?? null,
        idCommercial:       idCommercial ?? null,
        clientName:         payload.clientName ?? null,
        commercialName:     payload.commercialName ?? null,
        commercialPhone:    payload.commercialPhone ?? null,
        commercialEmail:    payload.commercialEmail ?? null,
        ville:              payload.ville ?? null,
        commune:            payload.commune ?? null,
        quartier:           payload.quartier ?? null,
        productCategory:    payload.productCategory ?? null,
        clientNeed:         payload.clientNeed ?? null,
        interestScore:      payload.interestScore ?? null,
        nextAction:         payload.nextAction ?? null,
        followUpAt:         payload.followUpAt ?? null,
        notes:              payload.notes ?? null,
        conversationResult: payload.conversationResult ?? null,
        closedAt:           payload.closedAt ?? null,
        syncStatus:         'synced',
        syncError:          null,
        submittedAt:        new Date(),
      };

      await this.orderDb
        .getRepository(MessagingClientDossierMirror)
        .upsert(row, ['messagingChatId']);

      await this.syncLog.markSuccess(logEntry.id);
      this.logger.log(`Dossier miroir DB2 upsert OK: chat=${payload.messagingChatId}`);
    } catch (err) {
      const message = (err as Error).message;
      await this.syncLog.markFailed(logEntry.id, message);
      this.logger.error(`Dossier miroir DB2 KO chat=${payload.messagingChatId}: ${message}`);
      throw err;
    }
  }

  /** Marque la fermeture dans la table miroir. */
  async markClosure(
    messagingChatId: string,
    result: string,
    closedAt: Date,
  ): Promise<void> {
    if (!this.orderDb) return;

    await this.orderDb
      .getRepository(MessagingClientDossierMirror)
      .update({ messagingChatId }, {
        conversationResult: result,
        closedAt,
        syncStatus: 'synced',
      });

    this.logger.log(`Fermeture marquée en DB2: chat=${messagingChatId} result=${result}`);
  }

  private async resolveCommercial(commercialIdDb1: string): Promise<number | null> {
    const m = await this.commercialMappingRepo.findOne({
      where:  { commercial_id: commercialIdDb1 },
      select: ['external_id'],
    });
    return m?.external_id ?? null;
  }

  private async resolveClient(contactIdDb1: string): Promise<number | null> {
    const m = await this.clientMappingRepo.findOne({
      where:  { contact_id: contactIdDb1 },
      select: ['external_id'],
    });
    return m?.external_id ?? null;
  }
}
