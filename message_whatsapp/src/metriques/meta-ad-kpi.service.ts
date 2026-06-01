import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface MetaAdKpiDto {
  dateFrom: string;
  dateTo:   string;
}

export interface MetaAdKpiRow {
  source_id:             string;
  headline:              string | null;
  total_conversations:   number;
  conversations_closed:  number;
  conversion_rate:       number;
  avg_messages_per_chat: number;
  avg_first_response_s:  number | null;
  first_seen:            string;
  last_seen:             string;
}

@Injectable()
export class MetaAdKpiService {
  constructor(private readonly dataSource: DataSource) {}

  async getCampagnesMeta(dto: MetaAdKpiDto): Promise<MetaAdKpiRow[]> {
    const dateFrom = new Date(`${dto.dateFrom}T00:00:00.000Z`);
    const dateToExclusive = new Date(`${dto.dateTo}T00:00:00.000Z`);
    dateToExclusive.setDate(dateToExclusive.getDate() + 1);

    return this.dataSource.query(`
      SELECT
        r.source_id,
        MAX(r.headline)                                       AS headline,
        COUNT(DISTINCT c.id)                                  AS total_conversations,
        SUM(CASE WHEN c.status = 'fermé' THEN 1 ELSE 0 END)  AS conversations_closed,
        ROUND(
          SUM(CASE WHEN c.status = 'fermé' THEN 1 ELSE 0 END)
          / COUNT(DISTINCT c.id) * 100, 1
        )                                                     AS conversion_rate,
        ROUND(AVG(msg_count.cnt), 1)                          AS avg_messages_per_chat,
        ROUND(AVG(first_response.delta_s), 0)                 AS avg_first_response_s,
        MIN(r.created_at)                                     AS first_seen,
        MAX(r.created_at)                                     AS last_seen
      FROM meta_ad_referral r
      INNER JOIN whatsapp_chat c ON c.id = r.chat_id AND c.deletedAt IS NULL
      LEFT JOIN (
        SELECT tenant_id, chat_id, COUNT(*) AS cnt
        FROM whatsapp_message WHERE deletedAt IS NULL
        GROUP BY tenant_id, chat_id
      ) msg_count ON msg_count.chat_id = c.chat_id
                AND msg_count.tenant_id <=> c.tenant_id
      LEFT JOIN (
        SELECT
          first_in.tenant_id,
          first_in.chat_id,
          TIMESTAMPDIFF(SECOND, first_in.first_in_ts, MIN(msg_out.timestamp)) AS delta_s
        FROM (
          SELECT tenant_id, chat_id, MIN(timestamp) AS first_in_ts
          FROM whatsapp_message
          WHERE direction = 'IN' AND deletedAt IS NULL
          GROUP BY tenant_id, chat_id
        ) first_in
        INNER JOIN whatsapp_message msg_out
          ON msg_out.chat_id        = first_in.chat_id
         AND msg_out.tenant_id     <=> first_in.tenant_id
         AND msg_out.direction      = 'OUT'
         AND msg_out.timestamp      > first_in.first_in_ts
         AND msg_out.deletedAt     IS NULL
         AND msg_out.commercial_id IS NOT NULL
        GROUP BY first_in.tenant_id, first_in.chat_id, first_in.first_in_ts
      ) first_response ON first_response.chat_id = c.chat_id
                     AND first_response.tenant_id <=> c.tenant_id
      WHERE r.created_at >= ?
        AND r.created_at <  ?
      GROUP BY r.source_id
      ORDER BY total_conversations DESC
    `, [dateFrom, dateToExclusive]);
  }
}
