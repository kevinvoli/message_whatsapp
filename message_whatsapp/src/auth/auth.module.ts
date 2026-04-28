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

@Module({
  imports: [
    WhatsappCommercialModule,
    CommercialSessionModule,
    GeoAccessModule,
    PassportModule,
    ConfigModule,
    TypeOrmModule.forFeature([LoginLog]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '3600s' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, LoginLogService],
  controllers: [AuthController, LoginLogController],
  exports: [AuthService, LoginLogService],
})
export class AuthModule {}
