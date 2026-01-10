import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappMessageContent {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;
    
  @Column({name:'message_content_id', type:'string', length:100, nullable:false, })
  message_content_id: string;

  @Column({name:'message_id', type:'string', length:100, nullable:false, })
  message_id: string;

@Column({name:'content_type', type:'string', length:100, nullable:false, })
 content_type : string;

@CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
  createdAt: Date;

@UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
updatedAt: Date;

@DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
deletedAt: Date | null;

}
