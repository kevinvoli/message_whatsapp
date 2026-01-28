import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';

import * as bcrypt from 'bcrypt';

@Entity()
export class WhatsappCommercial {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ type: 'varchar', name: 'email', unique: true, nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: false })
  name: string;

  @Column({ type: 'varchar', nullable: false, select: false })
  password: string;

  @Column({
    type: 'enum',
    enum: ['ADMIN', 'COMMERCIAL'],
    default: 'COMMERCIAL',
  })
  role: string;


  @ManyToOne(() => WhatsappPoste, (poste) => poste.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'poste_id',
    referencedColumnName: 'id',
  })
  poste?: WhatsappPoste | null;

  @Column({ type: 'varchar', nullable: true })
  passwordResetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date | null;

  @Column({ type: 'boolean', default: false })
  isConnected: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectionAt: Date;

   @Column("varchar", { 
    name: "salt",
    length: 255,
    select: false,
    nullable: false, 
    default:'1232'
  })
  salt: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at?: Date;


  
  @BeforeInsert()
  private async hashPassword() {
    if (this.password) {
      this.salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, this.salt);
    }
  }

  
  // Méthodes
  async validatePassword(password: string): Promise<boolean> {
  if (!password || !this.password || !this.salt) {
    return false;
  }

  try {
console.log("l'utilisateur", password);

    // On compare directement le mot de passe fourni avec le hash stocké
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    console.error("Password validation error:", error);
    return false;
  }
}

   async passwordHash(password: string) {
    this.salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(password, this.salt);
  }
}
