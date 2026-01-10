import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappChatLabel {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;
  
    @Column({name:'chat_label_id', type:'string', length:100, nullable:false, })
   chat_label_id:string;

   @Column({name:'chat_id', type:'string', length:100, nullable:false, })
 chat_id :string;

@Column({name:'label_external_id', type:'string', length:100, nullable:false, })
 label_external_id:string;

@Column({name:'name', type:'string', length:100, nullable:false, })
 name:string;

@Column({name:'color', type:'string', length:100, nullable:false, })
 color:string;

@Column({name:'count', type:'string', length:100, nullable:false, })
 count:string;
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
