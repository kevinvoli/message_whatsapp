import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CommercialSubGroup } from './commercial-sub-group.entity';

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

  @Column({ name: 'work_days_count', type: 'int', default: 2 })
  workDaysCount: number;

  @Column({ name: 'first_work_day', type: 'date', nullable: true, default: null })
  firstWorkDay: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => WhatsappCommercial, (c) => c.group)
  commercials?: WhatsappCommercial[];

  @OneToMany(() => CommercialSubGroup, (s) => s.parentGroup)
  subGroups?: CommercialSubGroup[];
}
