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
          charset: 'utf8mb4',
          extra: {
            connectionLimit: 30,
            waitForConnections: true,
            queueLimit: 200,
            acquireTimeout: 10000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
          },
          autoLoadEntities: true,
          retryAttempts: 3,
          retryDelay: 1000,
          synchronize: isDev && forceSync,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
