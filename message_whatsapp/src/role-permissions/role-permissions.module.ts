import { Module } from '@nestjs/common';
import { RolePermissionsService } from './role-permissions.service';
import { RolePermissionsController } from './role-permissions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Roles } from '../roles/entities/role.entity';
import { Permissions } from '../permissions/entities/permission.entity';
import { RolePermissions } from './entities/role-permission.entity';
import { TokenService } from '../auth/jwt.service';
import { Token } from '../auth/entities/token.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Module({
  imports:[
    TypeOrmModule.forFeature([
      Roles,
      Permissions,
      RolePermissions,Token
      
     ]),
  ],
  controllers: [RolePermissionsController],
  providers: [RolePermissionsService,TokenService,JwtService,ConfigService],
})
export class RolePermissionsModule {}
