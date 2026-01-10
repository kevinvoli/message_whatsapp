import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { parse } from 'pg-connection-string';
import { DataSource, DataSourceOptions } from 'typeorm';
import { URL } from 'url';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // ConfigModule global, lecture process.env directement
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = configService.get('DATABASE_URL');
        if (!databaseUrl) {
          throw new Error('DATABASE_URL not set in environment variables.');
        }
        const url = new URL(databaseUrl);
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          host: url.hostname || process.env.DB_HOST,
          port: parseInt(url.port || '5432', 10),
          username: url.username,
          password: url.password,
          database: url.pathname.substring(1),
          entities: ['dist/**/*.entity.js'],
          migrations: ['dist/migrations/*.js'],

          migrationsTableName: 'migrations_history',
 
          synchronize: true,
          migrationsRun: false,
          logging: isProduction ? !isProduction : ['error', 'warn', 'schema'],
          ssl: isProduction,
          extra: isProduction ? { ssl: { rejectUnauthorized: false } } : {},

        };

      },
      dataSourceFactory: async (options: DataSourceOptions) => { // Type explicite ici
        const dataSource = new DataSource(options);
        await dataSource.initialize();
        return dataSource;
      },
    }),
  ],
})
export class DatabaseModule { }