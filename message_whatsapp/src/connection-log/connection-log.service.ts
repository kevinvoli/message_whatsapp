import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ConnectionLog,
  ConnectionUserType,
} from './entities/connection-log.entity';

@Injectable()
export class ConnectionLogService {
  constructor(
    @InjectRepository(ConnectionLog)
    private readonly repo: Repository<ConnectionLog>,
  ) {}

  private async closeOpenSessions(
    userId: string,
    userType: ConnectionUserType,
  ): Promise<void> {
    await this.repo.update(
      { userId, userType, logoutAt: IsNull() },
      { logoutAt: new Date() },
    );
  }

  async logLogin(
    userId: string,
    userType: ConnectionUserType,
  ): Promise<ConnectionLog> {
    await this.closeOpenSessions(userId, userType);
    const log = this.repo.create({
      userId,
      userType,
      loginAt: new Date(),
      logoutAt: null,
    });
    return this.repo.save(log);
  }

  async logLogout(
    userId: string,
    userType: ConnectionUserType,
  ): Promise<void> {
    const log = await this.repo.findOne({
      where: { userId, userType, logoutAt: IsNull() },
      order: { loginAt: 'DESC' },
    });
    if (log) {
      log.logoutAt = new Date();
      await this.repo.save(log);
    }
  }

  async getTotalConnectionMinutes(
    userId: string,
    userType: ConnectionUserType,
    dateStart: Date,
    dateEnd: Date,
  ): Promise<number> {
    const now = new Date();
    // WHERE : sessions qui chevauchent la période [dateStart, dateEnd]
    // ON évite COALESCE dans le WHERE (risque de binding TypeORM) en testant
    // séparément les sessions ouvertes et fermées.
    // SELECT : intersection GREATEST/LEAST pour ne compter que le temps dans la période.
    const result = await this.repo
      .createQueryBuilder('log')
      .select(
        `SUM(TIMESTAMPDIFF(
          MINUTE,
          GREATEST(log.loginAt, :dateStart),
          LEAST(CASE WHEN log.logoutAt IS NULL THEN :now ELSE log.logoutAt END, :dateEnd)
        ))`,
        'total_minutes',
      )
      .where('log.userId = :userId', { userId })
      .andWhere('log.userType = :userType', { userType })
      .andWhere('log.loginAt <= :dateEnd')
      .andWhere('(log.logoutAt IS NULL OR log.logoutAt >= :dateStart)')
      .setParameter('userId', userId)
      .setParameter('userType', userType)
      .setParameter('dateStart', dateStart)
      .setParameter('dateEnd', dateEnd)
      .setParameter('now', now)
      .getRawOne();
    return parseInt(result?.total_minutes) || 0;
  }

  async getBulkConnectionMinutes(
    userIds: string[],
    userType: ConnectionUserType,
    dateStart: Date,
    dateEnd: Date,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const now = new Date();
    const rows = await this.repo
      .createQueryBuilder('log')
      .select('log.userId', 'userId')
      .addSelect(
        `SUM(TIMESTAMPDIFF(
          MINUTE,
          GREATEST(log.loginAt, :dateStart),
          LEAST(CASE WHEN log.logoutAt IS NULL THEN :now ELSE log.logoutAt END, :dateEnd)
        ))`,
        'total_minutes',
      )
      .where('log.userId IN (:...userIds)', { userIds })
      .andWhere('log.userType = :userType', { userType })
      .andWhere('log.loginAt <= :dateEnd')
      .andWhere('(log.logoutAt IS NULL OR log.logoutAt >= :dateStart)')
      .setParameter('userIds', userIds)
      .setParameter('userType', userType)
      .setParameter('dateStart', dateStart)
      .setParameter('dateEnd', dateEnd)
      .setParameter('now', now)
      .groupBy('log.userId')
      .getRawMany();
    return new Map(
      rows.map((r) => [r.userId as string, parseInt(r.total_minutes) || 0]),
    );
  }
}
