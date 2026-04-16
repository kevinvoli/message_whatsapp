import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum RecipientStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
  OPTED_OUT = 'OPTED_OUT',
}

@Entity({ name: 'whatsapp_broadcast_recipient' })
@Index('IDX_bcr_broadcast_id', ['broadcast_id'])
@Index('IDX_bcr_status', ['broadcast_id', 'status'])
@Index('UQ_bcr_broadcast_phone', ['broadcast_id', 'phone'], { unique: true })
export class WhatsappBroadcastRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  broadcast_id: string;

  /** Numéro E.164 du destinataire */
  @Column({ type: 'varchar', length: 20, nullable: false })
  phone: string;

  /**
   * Variables spécifiques à ce destinataire pour le template HSM.
   * Ex: { "1": "Jean", "2": "2026-04-20" }
   */
  @Column({ type: 'json', nullable: true })
  variables: Record<string, string> | null;

  @Column({ type: 'enum', enum: RecipientStatus, default: RecipientStatus.PENDING })
  status: RecipientStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  error_message: string | null;

  /** ID du message Meta (wamid) après envoi réussi */
  @Column({ type: 'varchar', length: 100, nullable: true })
  provider_message_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
