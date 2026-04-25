import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Table miroir côté DB2 : résumé complet du dossier client vu par la messagerie.
 * SEULE table que nous écrivons dans DB2 pour ce domaine.
 *
 * Clé naturelle : messaging_chat_id (notre chat_id DB1).
 * Upsert idempotent : ON DUPLICATE KEY UPDATE.
 */
@Entity('messaging_client_dossier_mirror')
@Index('IDX_mirror_id_client',     ['idClient'])
@Index('IDX_mirror_id_commercial', ['idCommercial'])
export class MessagingClientDossierMirror {
  /** Clé primaire : notre chat_id (DB1). */
  @PrimaryColumn({ name: 'messaging_chat_id', type: 'varchar', length: 100 })
  messagingChatId: string;

  /** ID client dans DB2 (commandes.id_client). Null si mapping absent. */
  @Column({ name: 'id_client', type: 'int', nullable: true })
  idClient: number | null;

  /** ID commercial dans DB2 (commandes.id_commercial). Null si mapping absent. */
  @Column({ name: 'id_commercial', type: 'int', nullable: true })
  idCommercial: number | null;

  // ─── Identifiant messaging du client ─────────────────────────────────────

  /**
   * Contact de la messagerie : numéro WhatsApp, nom Messenger, handle Telegram ou Instagram.
   * Source : WhatsappChat.contact_client
   */
  @Column({ name: 'client_messaging_contact', type: 'varchar', length: 200, nullable: true })
  clientMessagingContact: string | null;

  /**
   * Tous les numéros de téléphone associés au client, sérialisés en JSON.
   * Format : [{"phone":"...", "label":"...", "isPrimary":true}, ...]
   * Source : Contact.phone (principal) + ContactPhone[]
   */
  @Column({ name: 'client_phones', type: 'text', nullable: true })
  clientPhones: string | null;

  // ─── Données du rapport conversationnel ──────────────────────────────────

  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true })
  clientName: string | null;

  @Column({ name: 'commercial_name', type: 'varchar', length: 200, nullable: true })
  commercialName: string | null;

  @Column({ name: 'commercial_phone', type: 'varchar', length: 30, nullable: true })
  commercialPhone: string | null;

  @Column({ name: 'commercial_email', type: 'varchar', length: 200, nullable: true })
  commercialEmail: string | null;

  @Column({ name: 'ville', type: 'varchar', length: 100, nullable: true })
  ville: string | null;

  @Column({ name: 'commune', type: 'varchar', length: 100, nullable: true })
  commune: string | null;

  @Column({ name: 'quartier', type: 'varchar', length: 100, nullable: true })
  quartier: string | null;

  @Column({ name: 'product_category', type: 'varchar', length: 200, nullable: true })
  productCategory: string | null;

  @Column({ name: 'client_need', type: 'text', nullable: true })
  clientNeed: string | null;

  @Column({ name: 'interest_score', type: 'tinyint', nullable: true })
  interestScore: number | null;

  @Column({ name: 'next_action', type: 'varchar', length: 50, nullable: true })
  nextAction: string | null;

  @Column({ name: 'follow_up_at', type: 'datetime', nullable: true })
  followUpAt: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  // ─── Données de fermeture ────────────────────────────────────────────────

  @Column({ name: 'conversation_result', type: 'varchar', length: 50, nullable: true })
  conversationResult: string | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  // ─── Statut de synchronisation ───────────────────────────────────────────

  @Column({
    name:    'sync_status',
    type:    'enum',
    enum:    ['pending', 'synced', 'error'],
    default: 'pending',
  })
  syncStatus: 'pending' | 'synced' | 'error';

  @Column({ name: 'sync_error', type: 'text', nullable: true })
  syncError: string | null;

  @Column({ name: 'submitted_at', type: 'datetime', nullable: true })
  submittedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
