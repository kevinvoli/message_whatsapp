import { WhatsappInteractiveContent } from 'src/whatsapp_interactive_content/entities/whatsapp_interactive_content.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index('UQ_whatsapp_button_button_id', ['button_id'], { unique: true })
export class WhatsappButton {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'button_id', type: 'varchar', length: 100, nullable: false, unique: true })
  button_id: string;
  @Column({
    name: 'interactive_content_id', type: 'varchar', length: 100, nullable: false,
  })
  interactive_content_id: string;



  @Column({ name: 'type', type: 'varchar', length: 100, nullable: false })
  type: string;
  @Column({ name: 'title', type: 'varchar', length: 100, nullable: false })
  title: string;
  @Column({ name: 'payload', type: 'varchar', length: 100, nullable: false })
  payload: string;

  @Column({ name: 'url', type: 'varchar', length: 100, nullable: false })
  url: string;

  @Column({
    name: 'phone_number',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  phone_number: string;

  @ManyToOne(()=>WhatsappInteractiveContent, (InteractiveContent)=> InteractiveContent.button )
  @JoinColumn({name: 'interractive_content_id', referencedColumnName: 'interactive_content_id'})
  interactiveContent: WhatsappInteractiveContent


  @CreateDateColumn({
    name: 'createdAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was created',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updatedAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was last updated',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    name: 'deletedAt',
    type: 'timestamp',
    nullable: true,
    comment: 'Timestamp when the trajet was deleted',
  })
  deletedAt: Date | null;
}

// @ManyToOne(() => LigneTransport, (ligneTransport) => ligneTransport.id_ligne_transport)
//     @JoinColumn({ name: 'id_ligne_transport', referencedColumnName: 'id_ligne_transport' })
//     ligneTransport: LigneTransport;

//     @OneToOne(()=> SegmentTrajet, (segmentTrajet) => segmentTrajet.id_segment_trajet)
//     @JoinColumn({ name: 'id_segment_trajet', referencedColumnName: 'id_segment_trajet' })
//     segmentTrajet: SegmentTrajet;