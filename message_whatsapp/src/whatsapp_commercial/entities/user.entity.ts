import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { Entity, Column, PrimaryGeneratedColumn,CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
// import * as bcrypt from 'bcrypt';


@Entity()
export class WhatsappCommercial {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ type: 'varchar', name: 'email', unique: true, nullable:true })
  email: string;

  @Column({ type: 'varchar', nullable: false })
  name: string ;

  @Column({ type: 'varchar', nullable: false, select: false })
  password: string;

  @Column({ type: 'enum', enum: ['ADMIN', 'COMMERCIAL'], default: 'COMMERCIAL' })
  role: string;

  @Column({ type: 'varchar', nullable: true })
  passwordResetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date | null;

  @Column({ type: 'boolean', default: false })
  isConnected: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectionAt: Date;

  @OneToMany(() => WhatsappChat, (chat) => chat.commercial)
  chats: WhatsappChat[];

  @OneToMany(() => WhatsappMessage, (message) => message.commercial)
  messages: WhatsappMessage[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
 
}
