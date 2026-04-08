import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AutoMessageKeyword } from './auto-message-keyword.entity';

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
  INACTIVITY   = 'inactivity',
  ON_ASSIGN    = 'on_assign',
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
