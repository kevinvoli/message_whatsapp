import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChatTag } from './chat-tag.entity';

@Entity('tag')
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: '#6b7280' })
  color: string;

  @OneToMany(() => ChatTag, (ct) => ct.tag)
  chatTags: ChatTag[];

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp' })
  updatedAt: Date;
}
