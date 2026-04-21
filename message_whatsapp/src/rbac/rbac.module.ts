import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { CommercialRole } from './entities/commercial-role.entity';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, CommercialRole]),
  ],
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}
