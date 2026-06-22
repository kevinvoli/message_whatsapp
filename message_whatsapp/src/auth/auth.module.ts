import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCommercialModule } from '../whatsapp_commercial/whatsapp_commercial.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { CommercialSessionModule } from '../commercial-session/commercial_session.module';
import { GeoAccessModule } from '../geo-access/geo_access.module';
import { LoginLog } from './entities/login-log.entity';
import { LoginLogService } from './login-log.service';
import { LoginLogController } from './login-log.controller';
import { CommercialPlanning } from '../commercial-group/entities/commercial-planning.entity';
import { GroupScheduleDay } from '../commercial-group/entities/group-schedule-day.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WorkingDayGuard } from './working-day.guard';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    WhatsappCommercialModule,
    CommercialSessionModule,
    GeoAccessModule,
    PassportModule,
    ConfigModule,
    SystemConfigModule,
    PlatformSettingsModule,
    RbacModule,
    TypeOrmModule.forFeature([LoginLog, CommercialPlanning, GroupScheduleDay, WhatsappCommercial]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '3600s' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, LoginLogService, WorkingDayGuard],
  controllers: [AuthController, LoginLogController],
  exports: [AuthService, LoginLogService, WorkingDayGuard],
})
export class AuthModule {}
