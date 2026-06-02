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

    // CTEs pour limiter les scans de whatsapp_message aux seuls chats CTWA
    // de la période. Sans ça, les sous-requêtes agrégent toute la table.
    return this.dataSource.query(`
      WITH ctwa_chats AS (
        SELECT
          r.source_id,
          r.headline,
          r.created_at          AS referral_created_at,
          c.id                  AS chat_uuid,
          c.chat_id             AS wa_chat_id,
          c.tenant_id,
          c.status
        FROM meta_ad_referral r
        INNER JOIN whatsapp_chat c ON c.id = r.chat_id AND c.deletedAt IS NULL
        WHERE r.created_at >= ?
          AND r.created_at <  ?
      ),
      ctwa_ids AS (
        SELECT DISTINCT wa_chat_id, tenant_id FROM ctwa_chats
      ),
      msg_counts AS (
        SELECT m.chat_id, m.tenant_id, COUNT(*) AS cnt
        FROM whatsapp_message m
        INNER JOIN ctwa_ids ci
          ON ci.wa_chat_id   = m.chat_id
         AND ci.tenant_id   <=> m.tenant_id
        WHERE m.deletedAt IS NULL
        GROUP BY m.chat_id, m.tenant_id
      ),
      first_in AS (
        SELECT m.chat_id, m.tenant_id, MIN(m.timestamp) AS first_in_ts
        FROM whatsapp_message m
        INNER JOIN ctwa_ids ci
          ON ci.wa_chat_id   = m.chat_id
         AND ci.tenant_id   <=> m.tenant_id
        WHERE m.direction  = 'IN'
          AND m.deletedAt IS NULL
        GROUP BY m.chat_id, m.tenant_id
      ),
      first_response AS (
        SELECT
          fi.chat_id,
          fi.tenant_id,
          TIMESTAMPDIFF(SECOND, fi.first_in_ts, MIN(mo.timestamp)) AS delta_s
        FROM first_in fi
        INNER JOIN whatsapp_message mo
          ON mo.chat_id        = fi.chat_id
         AND mo.tenant_id     <=> fi.tenant_id
         AND mo.direction      = 'OUT'
         AND mo.timestamp      > fi.first_in_ts
         AND mo.deletedAt     IS NULL
         AND mo.commercial_id IS NOT NULL
        GROUP BY fi.chat_id, fi.tenant_id, fi.first_in_ts
      )
      SELECT
        cc.source_id,
        MAX(cc.headline)                                              AS headline,
        COUNT(DISTINCT cc.chat_uuid)                                  AS total_conversations,
        SUM(CASE WHEN cc.status = 'fermé' THEN 1 ELSE 0 END)         AS conversations_closed,
        ROUND(
          SUM(CASE WHEN cc.status = 'fermé' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(DISTINCT cc.chat_uuid), 0) * 100, 1
        )                                                             AS conversion_rate,
        ROUND(AVG(mc.cnt), 1)                                         AS avg_messages_per_chat,
        ROUND(AVG(fr.delta_s), 0)                                     AS avg_first_response_s,
        MIN(cc.referral_created_at)                                   AS first_seen,
        MAX(cc.referral_created_at)                                   AS last_seen
      FROM ctwa_chats cc
      LEFT JOIN msg_counts mc
        ON mc.chat_id   = cc.wa_chat_id
       AND mc.tenant_id <=> cc.tenant_id
      LEFT JOIN first_response fr
        ON fr.chat_id   = cc.wa_chat_id
       AND fr.tenant_id <=> cc.tenant_id
      GROUP BY cc.source_id
      ORDER BY total_conversations DESC
    `, [dateFrom, dateToExclusive]);
  }
}
