import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
// filtrages fréquents dans MetriquesService et QueueService
@Index('IDX_poste_is_active',         ['is_active'])
@Index('IDX_poste_queue_enabled',     ['is_queue_enabled'])
export class WhatsappPoste {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'code',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  code: string;

  @Column({ default: true })
  is_active: boolean;

  /** Identifiant numérique du poste sur la plateforme GICOP (nullable, unique) */
  @Column({ name: 'numero_poste', type: 'int', nullable: true, default: null, unique: true })
  numero_poste: number | null;

  @Column({ default: true })
  is_queue_enabled: boolean;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  name: string; //(Service client)

  @OneToMany(() => WhatsappChat, (chat) => chat.poste)
  chats?: WhatsappChat[] | null;

  @OneToMany(() => WhatsappMessage, (message) => message.poste)
  messages?: WhatsappMessage[] | null;

  @OneToMany(() => WhatsappCommercial, (commercial) => commercial.poste)
  commercial?: WhatsappCommercial[] | null;

  @OneToMany(() => WhapiChannel, (channel) => channel.poste)
  channels?: WhapiChannel[] | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
