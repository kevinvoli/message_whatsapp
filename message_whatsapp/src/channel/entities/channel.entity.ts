import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'whapi_channels', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_whapi_channel_id', ['channel_id'], { unique: true })
@Index('UQ_whapi_channels_provider_external_id', ['provider', 'external_id'], {
  unique: true,
})
export class WhapiChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @Column({ name: 'label', type: 'varchar', length: 100, nullable: true })
  label?: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 32, nullable: true })
  provider?: string | null;

  @Column({ name: 'external_id', type: 'varchar', length: 191, nullable: true })
  external_id?: string | null;

  @Column({
    name: 'channel_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  channel_id: string;

  @Column({ type: 'text' })
  token: string;

  @Column({ name: 'meta_app_id', type: 'varchar', length: 64, nullable: true })
  meta_app_id?: string | null;

  @Column({ name: 'meta_app_secret', type: 'varchar', length: 128, nullable: true })
  meta_app_secret?: string | null;

  @Column({ name: 'webhook_secret', type: 'varchar', length: 128, nullable: true })
  webhook_secret?: string | null;

  @Column({ name: 'verify_token', type: 'varchar', length: 128, nullable: true })
  verify_token?: string | null;

  @Column({ name: 'page_id', type: 'varchar', length: 64, nullable: true })
  page_id?: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'token_expires_at' })
  tokenExpiresAt: Date | null;

  @Column({ type: 'int' })
  start_at: number;

  @Column({ type: 'int' })
  uptime: number;

  // @Column(() => WhapiStatus)
  // status: WhapiStatus;

  @Column()
  version: string;

  @OneToMany(() => WhatsappMessage, (message) => message.channel)
  messages: WhatsappMessage[];

  @OneToMany(() => WhatsappChat, (chat) => chat.channel)
  chats: WhatsappChat[];

  @OneToMany(() => WhatsappMedia, (media) => media.chat)
  medias: WhatsappMedia[];

  // @Column(() => WhapiUser)
  // user: WhapiUser;

  @Column({ type: 'int' })
  device_id: number;

  @Column()
  ip: string;

  @Column({ default: false })
  is_business: boolean;

  @Column()
  api_version: string;

  @Column()
  core_version: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
