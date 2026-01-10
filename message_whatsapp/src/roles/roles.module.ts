import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Roles } from './entities/role.entity';
import { TokenService } from '../auth/jwt.service';
import { Token } from '../auth/entities/token.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RolePermissions } from '../role-permissions/entities/role-permission.entity';
import { Permissions } from '../permissions/entities/permission.entity';

@Module({
  imports:[
    TypeOrmModule.forFeature([
      Roles,Token,Permissions,RolePermissions
      
     ]),
  ],
  controllers: [RolesController],
  providers: [RolesService,TokenService,JwtService,ConfigService],
})
export class RolesModule {}
