import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommercialGroup } from './commercial-group.entity';
import { SubGroupBreakSchedule } from './sub-group-break-schedule.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Entity('commercial_sub_group')
@Index('IDX_sub_group_parent', ['parentGroupId'])
@Index('UQ_sub_group_name', ['parentGroupId', 'name'], { unique: true })
export class CommercialSubGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'parent_group_id', type: 'char', length: 36 })
  parentGroupId: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true, default: null })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;

  @ManyToOne(() => CommercialGroup, (g) => g.subGroups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_group_id' })
  parentGroup?: CommercialGroup;

  @OneToMany(() => SubGroupBreakSchedule, (s) => s.subGroup)
  breakSchedules?: SubGroupBreakSchedule[];

  @OneToMany(() => WhatsappCommercial, (c) => c.subGroup)
  members?: WhatsappCommercial[];
}
