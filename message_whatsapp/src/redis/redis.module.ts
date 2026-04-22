import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DistributedLockService } from './distributed-lock.service';

/**
 * CTX-F1 — RedisModule
 *
 * Expose un token REDIS_CLIENT (ioredis instance) de manière optionnelle.
 * Si REDIS_HOST n'est pas configuré, le client est null (graceful degradation).
 * Les consumers doivent vérifier if (client) avant toute opération Redis.
 *
 * Injection : @Inject(REDIS_CLIENT) private readonly redis: Redis | null
 */

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        const logger = new Logger('RedisModule');
        const host = config.get<string>('REDIS_HOST');
        if (!host) {
          logger.warn('REDIS_HOST non configuré — cache Redis désactivé (fallback in-process)');
          return null;
        }
        const port = config.get<number>('REDIS_PORT') ?? 6379;
        const password = config.get<string>('REDIS_PASSWORD') || undefined;

        const client = new Redis({ host, port, password, lazyConnect: true });

        client.on('connect', () => logger.log(`Redis connecté (${host}:${port})`));
        client.on('error', (err: Error) =>
          logger.error(`Redis erreur : ${err.message} — cache in-process utilisé en fallback`),
        );

        return client;
      },
    },
    DistributedLockService,
  ],
  exports: [REDIS_CLIENT, DistributedLockService],
})
export class RedisModule {}
