import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditController } from './admin-audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  providers: [AdminAuditService],
  controllers: [AdminAuditController],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}
