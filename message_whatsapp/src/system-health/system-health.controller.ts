import { Controller, Get, Inject, Optional, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';
import * as os from 'os';
import * as fs from 'fs';

function bytesToMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024);
}

/** MemAvailable depuis /proc/meminfo (Linux) — inclut le cache OS reclaimable. */
function readLinuxMemAvailable(): number | null {
  try {
    const content = fs.readFileSync('/proc/meminfo', 'utf8');
    const match = content.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    return match ? parseInt(match[1], 10) * 1024 : null;
  } catch {
    return null;
  }
}

/**
 * Limite mémoire du conteneur Docker (cgroup v2 puis v1).
 * Retourne null si hors conteneur ou si la limite = illimitée.
 */
function readContainerMemLimit(): number | null {
  // cgroup v2
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (raw !== 'max') return parseInt(raw, 10);
  } catch { /* pas cgroup v2 */ }
  // cgroup v1
  try {
    const raw = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim(), 10);
    if (raw < 9 * 1024 * 1024 * 1024 * 1024) return raw; // < 9 Tio = vraie limite
  } catch { /* pas cgroup v1 */ }
  return null;
}

function parseRedisInfo(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw.split('\r\n')
      .filter((line) => line.includes(':') && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf(':');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      }),
  );
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

    // Mémoire système
    const hostTotalBytes     = os.totalmem();
    const hostFreeBytes      = os.freemem();
    const containerLimitBytes = readContainerMemLimit();
    const memAvailableBytes  = readLinuxMemAvailable(); // inclut cache OS reclaimable

    // totalRamBytes = limite conteneur si disponible, sinon RAM hôte
    const totalRamBytes = containerLimitBytes ?? hostTotalBytes;
    // availableBytes = MemAvailable si /proc/meminfo lisible, sinon os.freemem()
    const availableRamBytes = memAvailableBytes ?? hostFreeBytes;
    const usedRamBytes = totalRamBytes - availableRamBytes;

    const isContainerized = containerLimitBytes !== null;

    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    let redisStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';
    let redisDetails: Record<string, unknown> | null = null;

    if (this.redis) {
      try {
        await this.redis.ping();
        redisStatus = 'ok';

        const raw = await this.redis.info();
        const info = parseRedisInfo(raw);

        const usedBytes = parseInt(info['used_memory'] ?? '0', 10);
        const peakBytes = parseInt(info['used_memory_peak'] ?? '0', 10);
        const maxBytes = parseInt(info['maxmemory'] ?? '0', 10);
        const connectedClients = parseInt(info['connected_clients'] ?? '0', 10);
        const blockedClients = parseInt(info['blocked_clients'] ?? '0', 10);
        const evictedKeys = parseInt(info['evicted_keys'] ?? '0', 10);
        const keyspaceHits = parseInt(info['keyspace_hits'] ?? '0', 10);
        const keyspaceMisses = parseInt(info['keyspace_misses'] ?? '0', 10);
        const maxmemoryPolicy = info['maxmemory_policy'] ?? 'unknown';

        const totalHits = keyspaceHits + keyspaceMisses;
        const hitRatioPct = totalHits > 0
          ? Math.round((keyspaceHits / totalHits) * 1000) / 10
          : null;
        const usagePct = maxBytes > 0
          ? Math.round((usedBytes / maxBytes) * 1000) / 10
          : null;

        const warnings: string[] = [];
        if (evictedKeys > 0) {
          warnings.push(`${evictedKeys} clé(s) évincée(s) — vérifier la politique mémoire`);
        }
        if (usagePct !== null && usagePct > 80) {
          warnings.push(`Mémoire Redis à ${usagePct}% — envisager une extension`);
        }
        if (maxmemoryPolicy !== 'noeviction') {
          warnings.push(`Politique "${maxmemoryPolicy}" non recommandée pour BullMQ (utiliser noeviction)`);
        }

        redisDetails = {
          memory: {
            usedMb: bytesToMb(usedBytes),
            peakMb: bytesToMb(peakBytes),
            maxMb: maxBytes > 0 ? bytesToMb(maxBytes) : null,
            usagePct,
          },
          clients: {
            connected: connectedClients,
            blocked: blockedClients,
          },
          stats: {
            evictedKeys,
            keyspaceHits,
            keyspaceMisses,
            hitRatioPct,
          },
          config: {
            maxmemoryPolicy,
          },
          warnings,
        };
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
        heapUsedMb:     bytesToMb(mem.heapUsed),
        heapTotalMb:    bytesToMb(mem.heapTotal),
        rssMb:          bytesToMb(mem.rss),
        externalMb:     bytesToMb(mem.external),
        arrayBuffersMb: bytesToMb(mem.arrayBuffers ?? 0),
        heapUsedPct:    Math.round((mem.heapUsed / mem.heapTotal) * 100),
        rssRamPct:      Math.round((mem.rss / totalRamBytes) * 100),
        heapWarning:    mem.heapUsed / mem.heapTotal > 0.80,
        system: {
          totalRamMb:      bytesToMb(totalRamBytes),
          availableRamMb:  bytesToMb(availableRamBytes),
          usedRamMb:       bytesToMb(usedRamBytes),
          ramUsedPct:      Math.round((usedRamBytes / totalRamBytes) * 100),
          isContainerized,
          // hostTotalRamMb exposé uniquement si dans un conteneur (contexte utile)
          ...(isContainerized && { hostTotalRamMb: bytesToMb(hostTotalBytes) }),
        },
      },
      services: {
        database: dbStatus,
        redis: redisStatus,
        ...(redisDetails && { redisDetails }),
      },
    };
  }
}
