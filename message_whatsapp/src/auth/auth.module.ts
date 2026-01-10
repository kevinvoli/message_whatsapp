import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { JwtStrategy } from './jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/token.entity';
import { Roles } from '../roles/entities/role.entity';
import { Users } from '../users/entity/users.entity';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Permissions } from '../permissions/entities/permission.entity';
import { TokenService } from './jwt.service';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { EntityLoader } from '../casl/entity-loader.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesService } from '../roles/roles.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { RolePermissions } from '../role-permissions/entities/role-permission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Token, Roles, Permissions, Users, RolePermissions]),
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.register({
      secret: process.env.SECRET,
      signOptions: {
        expiresIn: 3600
      }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService,
    JwtStrategy,
    TokenService,
    ConfigService,
    AuthService,
    RolesService,
    Repository,
    JwtService,
    ConfigService,
    JwtStrategy,
    CaslAbilityFactory,
    EntityLoader,
    PermissionsService,
    RolesService,
    RolePermissionsService,
  ],
})
export class AuthModule {  }
