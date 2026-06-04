import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AutoMessageKeyword } from './auto-message-keyword.entity';
import { MediaAsset } from 'src/media-asset/entities/media-asset.entity';

export enum AutoMessageChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
}

export enum AutoMessageTriggerType {
  SEQUENCE     = 'sequence',
  NO_RESPONSE  = 'no_response',
  OUT_OF_HOURS = 'out_of_hours',
  REOPENED     = 'reopened',
  QUEUE_WAIT   = 'queue_wait',
  KEYWORD      = 'keyword',
  CLIENT_TYPE  = 'client_type',
  INACTIVITY      = 'inactivity',
  ON_ASSIGN       = 'on_assign',
  WINDOW_REMINDER = 'window_reminder',
}

@Entity({ name: 'messages_predefinis', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class MessageAuto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  body: string;

  @Column({ type: 'int', default: 0, nullable: true })
  delai?: number | null;

  @Column({
    type: 'enum',
    enum: AutoMessageChannel,
    default: AutoMessageChannel.WHATSAPP,
    nullable: true,
  })
  canal?: AutoMessageChannel | null;

  @Column({ type: 'int', nullable: false })
  position: number;

  @Column({ type: 'boolean', default: true })
  actif: boolean;

  @Column({
    type: 'enum',
    enum: AutoMessageTriggerType,
    default: AutoMessageTriggerType.SEQUENCE,
  })
  trigger_type: AutoMessageTriggerType;

  /** Scope de restriction : null = global, 'poste' ou 'canal' = dédié */
  @Column({ name: 'scope_type', type: 'enum', enum: ['poste', 'canal'], nullable: true, default: null })
  scope_type?: 'poste' | 'canal' | null;

  /** ID du poste ou canal ciblé (utilisé si scope_type != null) */
  @Column({ name: 'scope_id', type: 'varchar', length: 100, nullable: true, default: null })
  scope_id?: string | null;

  /** Libellé lisible pour l'affichage admin */
  @Column({ name: 'scope_label', type: 'varchar', length: 200, nullable: true, default: null })
  scope_label?: string | null;

  /** Pour trigger_type='client_type' : cibler 'new', 'returning' ou 'all' */
  @Column({
    name: 'client_type_target',
    type: 'enum',
    enum: ['new', 'returning', 'all'],
    nullable: true,
    default: 'all',
  })
  client_type_target?: 'new' | 'returning' | 'all' | null;

  /** Pour trigger_type='window_reminder' : J1 (agent a répondu) ou J2 (pas encore) */
  @Column({
    name: 'window_reminder_target',
    type: 'enum',
    enum: ['with_replies', 'no_replies'],
    nullable: true,
    default: null,
  })
  windowReminderTarget?: 'with_replies' | 'no_replies' | null;

  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value) => (value ? JSON.stringify(value) : null),
      from: (value) => (value ? JSON.parse(value) : null),
    },
  })
  conditions?: {
    poste_id?: string;
    channel_id?: string;
    client_type?: string;
    [key: string]: any;
  } | null;

  /** Mots-clés déclencheurs (uniquement pour trigger_type='keyword') */
  @OneToMany(() => AutoMessageKeyword, (k) => k.messageAuto, {
    cascade: true,
    eager: false,
  })
  keywords?: AutoMessageKeyword[];

  @Column({ name: 'media_asset_id', type: 'varchar', length: 36, nullable: true })
  mediaAssetId: string | null;

  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset: MediaAsset | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
