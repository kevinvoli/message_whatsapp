// src/auth_admin/auth_admin.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthAdminService } from './auth_admin.service';
import { AuthAdminController } from './auth_admin.controller';
import { JwtAdminStrategy } from './jwt_admin.strategy';
import { AdminModule } from '../admin/admin.module';
import { AdminTokenRefreshInterceptor } from './token-refresh.interceptor';

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
  providers: [
    AuthAdminService,
    JwtAdminStrategy,
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminTokenRefreshInterceptor,
    },
  ],
  controllers: [AuthAdminController],
  exports: [AuthAdminService],
})
export class AuthAdminModule {}
