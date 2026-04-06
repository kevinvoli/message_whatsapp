import { ConsoleLogger, Injectable, LoggerService, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
const LOG_DIR = '/app/logs';
const METRICS_INTERVAL_MS = 60_000;

@Injectable()
export class AppLogger implements LoggerService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new ConsoleLogger(AppLogger.name);
  private readonly minLevelIndex: number;
  private fileStream: fs.WriteStream | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string>('LOG_LEVEL') ?? 'info';
    const normalized = configured.toLowerCase();
    const level = normalized === 'info' ? 'log' : normalized;
    const index = LOG_LEVELS.indexOf(level as (typeof LOG_LEVELS)[number]);
    this.minLevelIndex = index >= 0 ? index : LOG_LEVELS.indexOf('log');
    this.openFileStream();
  }

  onModuleInit() {
    // Log les métriques mémoire toutes les 60s pour détecter les fuites
    this.metricsTimer = setInterval(() => this.logMemoryMetrics(), METRICS_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.fileStream?.end();
  }

  log(message: any, context?: string) {
    if (this.shouldLog('log')) {
      this.logger.log(this.format(message), context);
    }
  }

  error(message: any, trace?: string, context?: string) {
    if (this.shouldLog('error')) {
      this.logger.error(this.format(message), trace, context);
      this.writeToFile('ERROR', message, context, trace);
    }
  }

  warn(message: any, context?: string) {
    if (this.shouldLog('warn')) {
      this.logger.warn(this.format(message), context);
      this.writeToFile('WARN', message, context);
    }
  }

  debug(message: any, context?: string) {
    if (this.shouldLog('debug')) {
      this.logger.debug(this.format(message), context);
    }
  }

  verbose(message: any, context?: string) {
    if (this.shouldLog('verbose')) {
      this.logger.verbose(this.format(message), context);
    }
  }

  private logMemoryMetrics() {
    const mem = process.memoryUsage();
    const fdCount = this.countOpenFds();
    const line = JSON.stringify({
      level: 'METRICS',
      timestamp: new Date().toISOString(),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      openFds: fdCount,
    });
    this.fileStream?.write(line + '\n');
    // Afficher aussi en console pour visibilité immédiate
    this.logger.log(line, 'MemoryMetrics');
  }

  private countOpenFds(): number {
    try {
      return fs.readdirSync('/proc/self/fd').length;
    } catch {
      return -1;
    }
  }

  private openFileStream() {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
      const today = new Date().toISOString().slice(0, 10);
      const filePath = path.join(LOG_DIR, `app-${today}.log`);
      this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    } catch {
      // Ne pas crasher si le dossier logs n'est pas accessible
      this.fileStream = null;
    }
  }

  private writeToFile(level: string, message: any, context?: string, trace?: string) {
    if (!this.fileStream) return;
    try {
      const line = JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        context,
        message: this.format(message),
        ...(trace ? { trace } : {}),
      });
      this.fileStream.write(line + '\n');
    } catch {
      // Silencieux — ne pas crasher le process pour un log raté
    }
  }

  private shouldLog(level: (typeof LOG_LEVELS)[number]) {
    return LOG_LEVELS.indexOf(level) <= this.minLevelIndex;
  }

  private format(message: any): string {
    if (typeof message === 'string') {
      return message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
