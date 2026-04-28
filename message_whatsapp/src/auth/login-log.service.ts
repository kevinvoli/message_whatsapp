import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { LoginLog, OtpStatus } from './entities/login-log.entity';
import { Request } from 'express';

@Injectable()
export class LoginLogService {
  private readonly logger = new Logger(LoginLogService.name);

  constructor(
    @InjectRepository(LoginLog)
    private readonly repo: Repository<LoginLog>,
  ) {}

  async record(params: {
    userId:    string;
    userName?: string | null;
    posteId?:  string | null;
    ip?:       string | null;
    device?:   string | null;
    localisation?: string | null;
    otpStatus?: OtpStatus;
  }): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          userId:       params.userId,
          userName:     params.userName ?? null,
          posteId:      params.posteId ?? null,
          ip:           params.ip ?? null,
          device:       params.device ?? null,
          localisation: params.localisation ?? null,
          otpStatus:    params.otpStatus ?? 'none',
        }),
      );
    } catch (err) {
      this.logger.warn(`LoginLog write failed: ${(err as Error).message}`);
    }
  }

  /** Extrait l'IP réelle d'une requête Express (derrière proxy). */
  static extractIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return first.trim();
    }
    return req.socket?.remoteAddress ?? null;
  }

  /** Extrait le User-Agent de la requête. */
  static extractDevice(req: Request): string | null {
    const ua = req.headers['user-agent'];
    return ua ? ua.slice(0, 255) : null;
  }

  async findAll(params: {
    userId?:  string;
    limit?:   number;
    offset?:  number;
  }): Promise<{ data: LoginLog[]; total: number }> {
    const qb = this.repo.createQueryBuilder('l').orderBy('l.loginAt', 'DESC');
    if (params.userId) qb.where('l.userId = :userId', { userId: params.userId });
    qb.take(params.limit ?? 50).skip(params.offset ?? 0);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /** Purge les entrées de plus de N jours. */
  async purgeOld(days = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.repo.delete({ loginAt: LessThanOrEqual(cutoff) });
    return result.affected ?? 0;
  }
}
