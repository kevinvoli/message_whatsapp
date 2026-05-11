import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Entity('commercial_group')
@Index('IDX_commercial_group_active', ['isActive'])
export class CommercialGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true, default: null })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => WhatsappCommercial, (c) => c.group)
  commercials?: WhatsappCommercial[];
}
