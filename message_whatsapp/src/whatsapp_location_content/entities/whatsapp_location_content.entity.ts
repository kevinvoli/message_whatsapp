import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappLocationContent {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;

  @Column({name:'location_content_id', type:'string', length:100, nullable:false, })
   location_content_id:string;

  @Column({name:'message_content_id', type:'string', length:100, nullable:false, })
 message_content_id :string;

@Column({name:'latitude', type:'string', length:100, nullable:false, })
 latitude:string;

@Column({name:'longitude', type:'string', length:100, nullable:false, })
 longitude:string;

@Column({name:'address', type:'string', length:100, nullable:false, })
 address:string;

@Column({name:'name', type:'string', length:100, nullable:false, })
 name:string;

@Column({name:'url', type:'string', length:100, nullable:false, })
 url:string;

@Column({name:'accuracy', type:'string', length:100, nullable:false, })
 accuracy:string;

@Column({name:'speed', type:'string', length:100, nullable:false, })
 speed:string;

@Column({name:'degrees', type:'string', length:100, nullable:false, })
 degrees:string;

 

  @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
    createdAt: Date;
  
  @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
  updatedAt: Date;
  
  @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
  deletedAt: Date | null;

}
