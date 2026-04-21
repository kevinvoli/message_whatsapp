import { Controller, Get, Inject, Optional, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';

function bytesToMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024);
}

@Controller('admin/system')
@UseGuards(AdminGuard)
export class SystemHealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  @Get('health')
  async getHealth() {
    const mem = process.memoryUsage();

    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    let redisStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';
    if (this.redis) {
      try {
        await this.redis.ping();
        redisStatus = 'ok';
      } catch {
        redisStatus = 'error';
      }
    }

    return {
      timestamp: new Date().toISOString(),
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      memory: {
        heapUsedMb: bytesToMb(mem.heapUsed),
        heapTotalMb: bytesToMb(mem.heapTotal),
        rssMb: bytesToMb(mem.rss),
        externalMb: bytesToMb(mem.external),
        heapUsedPct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }
}
