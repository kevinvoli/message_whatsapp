import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'channels', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_channels_provider_external_id', ['provider', 'external_id'], {
  unique: true,
})
@Index('IDX_channels_tenant_provider_external', [
  'tenant_id',
  'provider',
  'external_id',
])
export class ProviderChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenant_id: string;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ name: 'external_id', type: 'varchar', length: 191 })
  external_id: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 191, nullable: true })
  channel_id?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  status?: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
