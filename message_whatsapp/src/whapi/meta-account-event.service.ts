import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { MessageTemplateStatus } from 'src/message-auto/entities/message-template-status.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { normalizePhone } from 'src/common/utils/phone.utils';
import {
  MetaAccountAlertsValue,
  MetaAccountUpdateValue,
  MetaBusinessStatusValue,
  MetaCallsValue,
  MetaPhoneQualityValue,
  MetaTemplateQualityValue,
  MetaTemplateStatusValue,
  MetaUserPreferencesValue,
} from './interface/whatsapp-whebhook.interface';

@Injectable()
export class MetaAccountEventService {
  private readonly logger = new Logger(MetaAccountEventService.name);

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    @InjectRepository(MessageTemplateStatus)
    private readonly templateStatusRepo: Repository<MessageTemplateStatus>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
  ) {}

  async dispatch(field: string, value: unknown, wabaId?: string): Promise<void> {
    const v = (value ?? {}) as Record<string, unknown>;
    switch (field) {
      case 'account_update':
        await this.handleAccountUpdate(v as MetaAccountUpdateValue, wabaId);
        break;
      case 'business_status_update':
        await this.handleBusinessStatusUpdate(v as MetaBusinessStatusValue, wabaId);
        break;
      case 'phone_number_quality_update':
        await this.handlePhoneQualityUpdate(v as MetaPhoneQualityValue, wabaId);
        break;
      case 'account_alerts':
        await this.handleAccountAlerts(v as MetaAccountAlertsValue, wabaId);
        break;
      case 'message_template_status_update':
        await this.handleTemplateStatusUpdate(v as MetaTemplateStatusValue, wabaId);
        break;
      case 'message_template_quality_update':
        await this.handleTemplateQualityUpdate(v as MetaTemplateQualityValue, wabaId);
        break;
      case 'calls':
        await this.handleCalls(v as MetaCallsValue, wabaId);
        break;
      case 'user_preferences':
        await this.handleUserPreferences(v as MetaUserPreferencesValue, wabaId);
        break;
      case 'message_template_components_update':
        this.logger.log(
          `META_TEMPLATE_COMPONENTS template=${(v as any)?.message_template_name ?? '-'} waba=${wabaId ?? '-'}`,
        );
        break;
      case 'template_category_update':
        this.logger.log(
          `META_TEMPLATE_CATEGORY template=${(v as any)?.message_template_name ?? '-'} prev=${(v as any)?.previous_category ?? '-'} next=${(v as any)?.new_category ?? '-'} waba=${wabaId ?? '-'}`,
        );
        break;
      default:
        this.logger.log(
          `META_WEBHOOK_UNHANDLED field=${field} waba=${wabaId ?? '-'}`,
        );
    }
  }

  private async handleAccountUpdate(
    value: MetaAccountUpdateValue,
    wabaId?: string,
  ): Promise<void> {
    const event = value.event ?? 'UNKNOWN';
    const phone = value.phone_number ?? 'unknown';

    this.logger.warn(
      `META_ACCOUNT_UPDATE event=${event} phone=${phone} waba=${wabaId ?? '-'}`,
    );

    const status = this.mapAccountEventToStatus(event);
    if (status && phone !== 'unknown') {
      await this.channelRepo.update(
        { channel_id: phone },
        {
          meta_account_status: status,
          meta_account_status_updated_at: new Date(),
        },
      );
    }
  }

  private async handleBusinessStatusUpdate(
    value: MetaBusinessStatusValue,
    wabaId?: string,
  ): Promise<void> {
    const status = value.status ?? 'UNKNOWN';
    this.logger.warn(
      `META_BUSINESS_STATUS status=${status} reason=${value.reason ?? '-'} waba=${wabaId ?? '-'}`,
    );
    // Impact WABA entier — pas de canal individuel à mettre à jour ici
  }

  private async handlePhoneQualityUpdate(
    value: MetaPhoneQualityValue,
    wabaId?: string,
  ): Promise<void> {
    const event = value.event ?? 'UNKNOWN';
    const tier = value.current_limit ?? '-';
    this.logger.log(
      `META_PHONE_QUALITY event=${event} tier=${tier} phone=${value.display_phone_number ?? '-'} phone_id=${value.phone_number_id ?? '-'} waba=${wabaId ?? '-'}`,
    );
    if (value.phone_number_id) {
      const newStatus = event === 'FLAGGED' ? 'FLAGGED' : 'ACTIVE';
      await this.channelRepo.update(
        { channel_id: value.phone_number_id },
        {
          meta_account_status: newStatus,
          meta_account_status_updated_at: new Date(),
        },
      );
    }
  }

  private async handleAccountAlerts(
    value: MetaAccountAlertsValue,
    wabaId?: string,
  ): Promise<void> {
    const severity = value.alert_severity ?? 'UNKNOWN';
    const type = value.alert_type ?? value.type ?? 'UNKNOWN';
    this.logger.warn(
      `META_ACCOUNT_ALERT severity=${severity} type=${type} waba=${wabaId ?? '-'}`,
    );
  }

  private async handleTemplateStatusUpdate(
    value: MetaTemplateStatusValue,
    wabaId?: string,
  ): Promise<void> {
    const templateName = value.message_template_name;
    const language = value.message_template_language ?? 'unknown';
    const event = value.event ?? 'UNKNOWN';

    this.logger.log(
      `META_TEMPLATE_STATUS template=${templateName ?? '-'} lang=${language} event=${event} reason=${value.reason ?? '-'} waba=${wabaId ?? '-'}`,
    );

    if (!templateName) return;

    const existing = await this.templateStatusRepo.findOne({
      where: { templateName, language },
    });
    if (existing) {
      await this.templateStatusRepo.update(existing.id, {
        status: event,
        lastCheckedAt: new Date(),
      });
    } else {
      await this.templateStatusRepo.save({
        templateName,
        language,
        status: event,
        lastCheckedAt: new Date(),
      });
    }
  }

  private async handleTemplateQualityUpdate(
    value: MetaTemplateQualityValue,
    wabaId?: string,
  ): Promise<void> {
    const templateName = value.message_template_name;
    const language = value.message_template_language ?? 'unknown';
    const prev = value.previous_quality_score ?? '-';
    const next = value.new_quality_score ?? '-';

    this.logger.log(
      `META_TEMPLATE_QUALITY template=${templateName ?? '-'} lang=${language} quality=${prev}->${next} waba=${wabaId ?? '-'}`,
    );

    if (!templateName) return;

    const existing = await this.templateStatusRepo.findOne({
      where: { templateName, language },
    });
    if (existing) {
      await this.templateStatusRepo.update(existing.id, {
        qualityScore: next,
        lastCheckedAt: new Date(),
      });
    } else {
      await this.templateStatusRepo.save({
        templateName,
        language,
        status: 'UNKNOWN',
        qualityScore: next,
        lastCheckedAt: new Date(),
      });
    }
  }

  private async handleCalls(
    value: MetaCallsValue,
    wabaId?: string,
  ): Promise<void> {
    const status = value.status ?? 'unknown';
    const from = value.from ?? 'unknown';
    this.logger.log(
      `META_CALL status=${status} from=${from} waba=${wabaId ?? '-'}`,
    );

    // Pour les appels manqués : marquer le contact comme "à rappeler"
    if (status === 'missed' && from !== 'unknown') {
      const phoneNormalized = normalizePhone(from);
      const contact = phoneNormalized
        ? await this.contactRepo.findOne({ where: { phoneNormalized } })
        : null;

      if (contact) {
        await this.contactRepo.update(contact.id, {
          call_status: 'à_appeler' as any,
          last_call_date: new Date(),
        });
        this.logger.log(
          `META_CALL_MISSED contact_id=${contact.id} marked as à_appeler`,
        );
      } else {
        this.logger.log(
          `META_CALL_MISSED no contact found for phone=${from} — skipped`,
        );
      }
    }
  }

  private async handleUserPreferences(
    value: MetaUserPreferencesValue,
    wabaId?: string,
  ): Promise<void> {
    const waId = value.wa_id ?? 'unknown';
    const optInMarketing = value.opt_in_marketing;
    const messagingOptIn = value.messaging_opt_in;

    this.logger.log(
      `META_USER_PREFS wa_id=${waId} marketing=${optInMarketing ?? '-'} messaging=${messagingOptIn ?? '-'} waba=${wabaId ?? '-'}`,
    );

    if (waId === 'unknown') return;

    const phoneNormalized = normalizePhone(waId);
    const contact = phoneNormalized
      ? await this.contactRepo.findOne({ where: { phoneNormalized } })
      : null;

    if (!contact) {
      this.logger.log(
        `META_USER_PREFS no contact found for wa_id=${waId} — skipped`,
      );
      return;
    }

    const updates: Partial<Contact> = {};

    if (optInMarketing === false) {
      updates.marketing_opt_out = true;
    } else if (optInMarketing === true) {
      updates.marketing_opt_out = false;
    }

    if (Object.keys(updates).length > 0) {
      await this.contactRepo.update(contact.id, updates);
      this.logger.log(
        `META_USER_PREFS contact_id=${contact.id} marketing_opt_out=${updates.marketing_opt_out}`,
      );
    }
  }

  private mapAccountEventToStatus(event: string): string | null {
    const map: Record<string, string> = {
      DISABLED_ACCOUNT: 'DISABLED',
      BANNED_ACCOUNT: 'BANNED',
      RESTRICTION_ADDED: 'RESTRICTED',
      RESTRICTION_REMOVED: 'ACTIVE',
      VERIFIED_ACCOUNT: 'ACTIVE',
    };
    return map[event] ?? null;
  }
}
