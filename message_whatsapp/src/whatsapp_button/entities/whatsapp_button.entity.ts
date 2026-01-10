import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappButton {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;

  @Column({name:'button_id', type:'string', length:100, nullable:false, })
  button_id:string;
  @Column({name:'interactive_content_id', type:'string', length:100, nullable:false, })
 interactive_content_id:string;
@Column({name:'type', type:'string', length:100, nullable:false, })
 type:string;
@Column({name:'title', type:'string', length:100, nullable:false, })
 title:string;
@Column({name:'payload', type:'string', length:100, nullable:false, })
 payload:string;

@Column({name:'url', type:'string', length:100, nullable:false, })
 url:string;

@Column({name:'phone_number', type:'string', length:100, nullable:false, })
 phone_number:string;

@CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
  createdAt: Date;

@UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
updatedAt: Date;

@DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
deletedAt: Date | null;
}
