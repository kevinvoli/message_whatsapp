import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';

@Injectable()
export class SocketListCacheService {
  private readonly logger = new Logger(SocketListCacheService.name);
  private static readonly MAX_CONVERSATIONS_TTL = 15;

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async getConversations<T>(
    posteId: string,
    cursor: object | undefined,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (!this.redis) return loader();

    const ttl = 15;
    if (ttl > SocketListCacheService.MAX_CONVERSATIONS_TTL) {
      this.logger.warn(
        `TTL conversations ${ttl} dépasse MAX_CONVERSATIONS_TTL=${SocketListCacheService.MAX_CONVERSATIONS_TTL} — forcé à MAX`,
      );
    }

    const cursorHash = createHash('md5')
      .update(JSON.stringify(cursor ?? {}))
      .digest('hex')
      .slice(0, 8);
    const key = `socket:conversations:${posteId}:${cursorHash}`;

    const raw = await this.redis.get(key);
    if (raw !== null) return JSON.parse(raw) as T;

    const value = await loader();
    await this.redis.setex(key, 15, JSON.stringify(value));
    return value;
  }

  async invalidateConversations(posteId: string): Promise<void> {
    if (!this.redis) return;

    const pattern = `socket:conversations:${posteId}:*`;
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, found] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) {
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }
  }

  async getContacts<T>(posteId: string, loader: () => Promise<T>): Promise<T> {
    if (!this.redis) return loader();

    const key = `socket:contacts:${posteId}`;
    const raw = await this.redis.get(key);
    if (raw !== null) return JSON.parse(raw) as T;

    const value = await loader();
    await this.redis.setex(key, 10, JSON.stringify(value));
    return value;
  }

  async invalidateContacts(posteId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(`socket:contacts:${posteId}`);
  }

  async getQueuePositions<T>(loader: () => Promise<T>): Promise<T> {
    if (!this.redis) return loader();

    const key = 'queue:positions';
    const raw = await this.redis.get(key);
    if (raw !== null) return JSON.parse(raw) as T;

    const value = await loader();
    await this.redis.setex(key, 3, JSON.stringify(value));
    return value;
  }

  async invalidateQueuePositions(): Promise<void> {
    if (!this.redis) return;
    await this.redis.del('queue:positions');
  }
}
