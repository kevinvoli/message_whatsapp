import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappCustomer {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;

   @Column({name:'id_customer', type:'string', length:100, nullable:false, })
  customer_id:string

  @Column({name:'phone', type:'string', length:100, nullable:false, })
phone:string

@Column({name:'name', type:'string', length:100, nullable:false, })
name: string



@CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
  createdAt: Date;

@UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
updatedAt: Date;

@DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
deletedAt: Date | null;




}
