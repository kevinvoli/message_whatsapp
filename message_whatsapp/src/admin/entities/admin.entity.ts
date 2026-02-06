// src/admin/entities/admin.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import * as bcrypt from 'bcrypt';

@Entity()
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', select: false })
  password: string;

  @Column({ type: 'varchar', length: 255, select: false, nullable: true })
  salt: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @BeforeInsert()
  private async hashPassword() {
    if (this.password) {
      this.salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, this.salt);
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    if (!password || !this.password || !this.salt) {
      return false;
    }
    return bcrypt.compare(password, this.password);
  }
}
