// src/modules/auto-message/entities/message-auto.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AutoMessageChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
}

@Entity({ name: 'messages_predefinis', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class MessageAuto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  body: string;

  /** Nom du template HSM WhatsApp Business (null = message texte libre) */
  @Column({ name: 'template_name', type: 'varchar', length: 100, nullable: true })
  templateName?: string | null;

  /** Langue du template HSM (ex: 'fr', 'en_US') */
  @Column({ name: 'template_language', type: 'varchar', length: 20, nullable: true })
  templateLanguage?: string | null;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
