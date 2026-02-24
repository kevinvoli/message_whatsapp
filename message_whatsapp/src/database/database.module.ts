import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isDev = configService.get('NODE_ENV') !== 'production';
        const forceSync = configService.get('TYPEORM_SYNCHRONIZE') === 'true';

        return {
          type: 'mysql' as const,
          host: configService.get<string>('MYSQL_HOST'),
          port: configService.get<number>('MYSQL_PORT'),
          username: configService.get<string>('MYSQL_USER'),
          password: configService.get<string>('MYSQL_PASSWORD'),
          database: configService.get<string>('MYSQL_DATABASE'),
          connectTimeout: 10000,
          autoLoadEntities: true,
          retryAttempts: 0,
          synchronize: isDev && forceSync,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
