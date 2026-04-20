import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CommercialSession } from './entities/commercial_session.entity';

export interface SessionStatsDto {
  commercial_id: string;
  commercial_name: string | null;
  total_sessions: number;
  total_seconds: number;
  avg_session_seconds: number;
  last_connected_at: Date | null;
}

@Injectable()
export class CommercialSessionService {
  constructor(
    @InjectRepository(CommercialSession)
    private readonly sessionRepo: Repository<CommercialSession>,
  ) {}

  /** Ouvre une nouvelle session lors d'un login */
  async openSession(commercialId: string, commercialName?: string): Promise<void> {
    // Fermer toute session ouverte précédente (sécurité)
    await this.closeOpenSessions(commercialId);
    await this.sessionRepo.save(
      this.sessionRepo.create({
        commercial_id: commercialId,
        commercial_name: commercialName ?? null,
        connected_at: new Date(),
      }),
    );
  }

  /** Ferme la session en cours lors d'un logout */
  async closeSession(commercialId: string): Promise<void> {
    await this.closeOpenSessions(commercialId);
  }

  private async closeOpenSessions(commercialId: string): Promise<void> {
    const openSessions = await this.sessionRepo.find({
      where: { commercial_id: commercialId, disconnected_at: IsNull() },
    });
    const now = new Date();
    for (const session of openSessions) {
      const durationSeconds = Math.floor(
        (now.getTime() - session.connected_at.getTime()) / 1000,
      );
      await this.sessionRepo.update(session.id, {
        disconnected_at: now,
        duration_seconds: durationSeconds,
      });
    }
  }

  /** Statistiques par commercial pour une période */
  async getStats(from?: string, to?: string): Promise<SessionStatsDto[]> {
    const dateEnd = to ? new Date(to) : new Date();
    const dateStart = from
      ? new Date(from)
      : new Date(dateEnd.getTime() - 30 * 24 * 3600 * 1000);

    const rows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.commercial_id', 'commercial_id')
      .addSelect('s.commercial_name', 'commercial_name')
      .addSelect('COUNT(*)', 'total_sessions')
      .addSelect('SUM(COALESCE(s.duration_seconds, 0))', 'total_seconds')
      .addSelect('AVG(COALESCE(s.duration_seconds, 0))', 'avg_seconds')
      .addSelect('MAX(s.connected_at)', 'last_connected_at')
      .where('s.connected_at >= :dateStart', { dateStart })
      .andWhere('s.connected_at <= :dateEnd', { dateEnd })
      .groupBy('s.commercial_id, s.commercial_name')
      .orderBy('total_seconds', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      commercial_id:          r.commercial_id,
      commercial_name:        r.commercial_name,
      total_sessions:         parseInt(r.total_sessions) || 0,
      total_seconds:          parseInt(r.total_seconds) || 0,
      avg_session_seconds:    parseInt(r.avg_seconds) || 0,
      last_connected_at:      r.last_connected_at ? new Date(r.last_connected_at) : null,
    }));
  }

  /** Sessions d'un commercial spécifique */
  async getByCommercial(
    commercialId: string,
    limit = 30,
  ): Promise<CommercialSession[]> {
    return this.sessionRepo.find({
      where: { commercial_id: commercialId },
      order: { connected_at: 'DESC' },
      take: limit,
    });
  }
}
