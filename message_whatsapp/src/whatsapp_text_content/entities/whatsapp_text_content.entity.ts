import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappTextContent {
@PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;


  @Column({name:'text_content_id', type:'string', length:100, nullable:false, })
  text_content_id:string;

    @Column({name:'message_content_id', type:'string', length:100, nullable:false, })
message_content_id : string;

@Column({name:'body', type:'string', length:100, nullable:false, })
 body: string

@Column({name:'view_once', type:'string', length:100, nullable:false, })
view_once: string

  @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
    createdAt: Date;
  
  @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
  updatedAt: Date;
  
  @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
  deletedAt: Date | null;
}
