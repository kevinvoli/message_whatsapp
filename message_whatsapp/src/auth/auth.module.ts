import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCommercialModule } from '../whatsapp_commercial/whatsapp_commercial.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { DispatcherModule } from '../dispatcher/dispatcher.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { ConnectionLogModule } from 'src/connection-log/connection-log.module';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

@Module({
  imports: [
    WhatsappCommercialModule,
    SystemConfigModule,
    ConnectionLogModule,
    DispatcherModule,
    PassportModule,
    ConfigModule,
    TypeOrmModule.forFeature([WhapiChannel]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '3600s' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
