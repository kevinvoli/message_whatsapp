import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Entity('chat_session')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'whatsapp_chat_id', type: 'char', length: 36 })
  whatsappChatId: string;

  @ManyToOne(() => WhatsappChat)
  @JoinColumn({ name: 'whatsapp_chat_id', referencedColumnName: 'id' })
  chat: WhatsappChat;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true, default: null })
  endedAt: Date | null;

  @Column({ name: 'is_ctwa', type: 'boolean', default: false })
  isCtwa: boolean;

  @Column({ name: 'ctwa_referral_id', type: 'varchar', length: 255, nullable: true, default: null })
  ctwaReferralId: string | null;

  @Column({ name: 'campaign_name', type: 'varchar', length: 255, nullable: true, default: null })
  campaignName: string | null;

  @Column({ name: 'campaign_image_url', type: 'varchar', length: 1024, nullable: true, default: null })
  campaignImageUrl: string | null;

  @Column({ name: 'last_client_message_at', type: 'datetime', nullable: true, default: null })
  lastClientMessageAt: Date | null;

  @Column({ name: 'last_poste_message_at', type: 'datetime', nullable: true, default: null })
  lastPosteMessageAt: Date | null;

  @Column({ name: 'service_window_expires_at', type: 'datetime', nullable: true, default: null })
  serviceWindowExpiresAt: Date | null;

  @Column({ name: 'free_entry_expires_at', type: 'datetime', nullable: true, default: null })
  freeEntryExpiresAt: Date | null;

  @Column({ name: 'auto_close_at', type: 'datetime', nullable: true, default: null })
  autoCloseAt: Date | null;

  @Column({ name: 'last_window_reminder_sent_at', type: 'datetime', nullable: true, default: null })
  lastWindowReminderSentAt: Date | null;
}
