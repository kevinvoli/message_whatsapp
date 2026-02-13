import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

@Injectable()
export class AppLogger implements LoggerService {
  private readonly logger = new ConsoleLogger(AppLogger.name);
  private readonly minLevelIndex: number;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string>('LOG_LEVEL') ?? 'info';
    const normalized = configured.toLowerCase();
    const level = normalized === 'info' ? 'log' : normalized;
    const index = LOG_LEVELS.indexOf(level as (typeof LOG_LEVELS)[number]);
    this.minLevelIndex = index >= 0 ? index : LOG_LEVELS.indexOf('log');
  }

  log(message: any, context?: string) {
    if (this.shouldLog('log')) {
      this.logger.log(this.format(message), context);
    }
  }

  error(message: any, trace?: string, context?: string) {
    if (this.shouldLog('error')) {
      this.logger.error(this.format(message), trace, context);
    }
  }

  warn(message: any, context?: string) {
    if (this.shouldLog('warn')) {
      this.logger.warn(this.format(message), context);
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
