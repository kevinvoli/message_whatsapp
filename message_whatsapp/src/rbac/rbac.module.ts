import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { CommercialRole } from './entities/commercial-role.entity';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, CommercialRole]),
    RedisModule,
  ],
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}
