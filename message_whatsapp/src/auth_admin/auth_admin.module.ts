// src/auth_admin/auth_admin.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthAdminService } from './auth_admin.service';
import { AuthAdminController } from './auth_admin.controller';
import { JwtAdminStrategy } from './jwt_admin.strategy';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    AdminModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '3600s' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthAdminService, JwtAdminStrategy],
  controllers: [AuthAdminController],
  exports: [AuthAdminService],
})
export class AuthAdminModule {}
