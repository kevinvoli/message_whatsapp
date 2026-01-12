import { Entity, Column, PrimaryGeneratedColumn,CreateDateColumn, UpdateDateColumn } from 'typeorm';
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

  // @Column()
  // password: string;

  @Column({ type: 'varchar', nullable: true })
  passwordResetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  // @BeforeInsert()
  // async hashPassword() {
  //   if (this.password) {
  //     this.password = await bcrypt.hash(this.password, 10);
  //   }
  // }
}
