import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappMedia {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;
  
    @Column({name:'media_id', type:'string', length:100, nullable:false, })
     media_id:string;

    @Column({name:'message_content_id', type:'string', length:100, nullable:false, })
 message_content_id :string;

@Column({name:'media_type', type:'string', length:100, nullable:false, })
 media_type :'image'| 'video'| 'audio'| 'document'|'gif'|'voice'

@Column({name:'whapi_media_id', type:'string', length:100, nullable:false, })
 whapi_media_id:string;

@Column({name:'url', type:'string', length:100, nullable:false, })
 url:string;

@Column({name:'mime_type', type:'string', length:100, nullable:false, })
 mime_type:string;

@Column({name:'file_name', type:'string', length:100, nullable:false, })
 file_name:string;

@Column({name:'file_size', type:'string', length:100, nullable:false, })
 file_size:string;

@Column({name:'sha256', type:'string', length:100, nullable:false, })
 sha256:string;

@Column({name:'width', type:'string', length:100, nullable:false, })
 width:string;

@Column({name:'height', type:'string', length:100, nullable:false, })
 height:string;

@Column({name:'duration_seconds', type:'string', length:100, nullable:false, })
 duration_seconds:string;

@Column({name:'caption', type:'string', length:100, nullable:false, })
 caption:string;

@Column({name:'preview', type:'string', length:100, nullable:false, })
 preview:string;

@Column({name:'view_once', type:'string', length:100, nullable:false, })
 view_once:string;
   
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
