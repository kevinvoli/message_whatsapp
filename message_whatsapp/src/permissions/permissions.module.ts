import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permissions } from './entities/permission.entity';
import { TokenService } from '../auth/jwt.service';
import { Token } from '../auth/entities/token.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../roles/entities/role.entity';
import { RolePermissions } from '../role-permissions/entities/role-permission.entity';

@Module({
  imports:[
    TypeOrmModule.forFeature([
      Permissions,Token,Roles,RolePermissions
      
     ]),
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService,TokenService,JwtService,ConfigService],
})
export class PermissionsModule {}
