import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface PendingIndex {
  table: string;
  name: string;
  columns: string;
}

/**
 * Crée les index sur grandes tables en arrière-plan après le démarrage de l'app.
 * Ces index ne peuvent pas être dans les migrations TypeORM car leur création
 * bloque le pipeline CI/CD (tables volumineuses = minutes de traitement).
 * Ce service les crée automatiquement et de manière idempotente au boot.
 */
@Injectable()
export class BackgroundIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackgroundIndexService.name);

  private readonly pendingIndexes: PendingIndex[] = [
    // conversation_report — fenêtre glissante (cron/minute)
    { table: 'conversation_report', name: 'IDX_conv_report_chat_submitted',  columns: '`chat_id`, `is_submitted`' },
    // whatsapp_chat — fenêtre glissante (cron/minute)
    { table: 'whatsapp_chat',       name: 'IDX_chat_window_slot_status',     columns: '`poste_id`, `window_slot`, `window_status`' },
    // whatsapp_chat — pollInactivity FlowBot (cron 5m)
    { table: 'whatsapp_chat',       name: 'IDX_chat_status_activity',        columns: '`status`, `last_activity_at`' },
    // whatsapp_message — métriques trafic (déjà dans AddMetricsAnalyticsIndexes, idempotent)
    { table: 'whatsapp_message',    name: 'IDX_msg_chat_created',            columns: '`chat_id`, `createdAt`' },
    { table: 'whatsapp_message',    name: 'IDX_msg_status_created',          columns: '`status`, `createdAt`' },
    { table: 'whatsapp_message',    name: 'IDX_msg_direction_created',       columns: '`direction`, `createdAt`' },
    { table: 'whatsapp_message',    name: 'IDX_msg_sentiment',               columns: '`sentiment_label`, `createdAt`' },
    // whatsapp_chat — métriques par commercial/canal (déjà dans AddMetricsAnalyticsIndexes, idempotent)
    { table: 'whatsapp_chat',       name: 'IDX_chat_commercial_status',      columns: '`poste_id`, `status`, `createdAt`' },
    { table: 'whatsapp_chat',       name: 'IDX_chat_channel_status',         columns: '`channel_id`, `status`, `createdAt`' },
    { table: 'whatsapp_chat',       name: 'IDX_chat_status_last_msg',        columns: '`status`, `last_client_message_at`' },
  ];

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    // Délai de 5 minutes avant de démarrer pour ne pas bloquer les requêtes
    // au démarrage (les DDL MariaDB posent un metadata lock sur la table)
    setTimeout(() => void this.createPendingIndexes(), 5 * 60 * 1000);
  }

  private async createPendingIndexes(): Promise<void> {
    this.logger.log(`Démarrage création background de ${this.pendingIndexes.length} index sur grandes tables`);

    for (const idx of this.pendingIndexes) {
      try {
        const exists = await this.indexExists(idx.table, idx.name);
        if (exists) continue;

        this.logger.log(`Création index ${idx.name} sur ${idx.table}…`);
        await this.dataSource.query(
          `ALTER TABLE \`${idx.table}\` ADD INDEX \`${idx.name}\` (${idx.columns})`,
        );
        this.logger.log(`Index ${idx.name} créé avec succès`);
      } catch (err) {
        this.logger.error(
          `Échec création index ${idx.name} sur ${idx.table}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log('Création background des index terminée');
  }

  private async indexExists(table: string, indexName: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = ?
         AND INDEX_NAME   = ?`,
      [table, indexName],
    ) as Array<{ cnt: string }>;
    return parseInt(rows[0].cnt, 10) > 0;
  }
}
