import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FeatureFlagEntry {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  envVar: string;
  category: 'security' | 'resilience' | 'messaging' | 'infra';
}

const FLAG_DEFINITIONS: Omit<FeatureFlagEntry, 'enabled'>[] = [
  {
    key: 'FF_UNIFIED_WEBHOOK_ROUTER',
    label: 'Router webhook unifié',
    description: 'Active le router webhook centralisé (multi-provider)',
    envVar: 'FF_UNIFIED_WEBHOOK_ROUTER',
    category: 'infra',
  },
  {
    key: 'FF_SHADOW_UNIFIED',
    label: 'Shadow mode router unifié',
    description: 'Traite les webhooks via le nouveau router en shadow (sans effet)',
    envVar: 'FF_SHADOW_UNIFIED',
    category: 'infra',
  },
  {
    key: 'FF_HMAC_WEBHOOK',
    label: 'Validation HMAC webhook',
    description: 'Vérifie la signature HMAC des webhooks Whapi entrants',
    envVar: 'FF_HMAC_WEBHOOK',
    category: 'security',
  },
  {
    key: 'FF_PHONE_DEDUP',
    label: 'Déduplication E.164',
    description: 'Normalise les numéros de téléphone en E.164 pour éviter les doublons de contacts',
    envVar: 'FF_PHONE_DEDUP',
    category: 'messaging',
  },
  {
    key: 'FF_VOICE_PREVIEW',
    label: 'Prévisualisation vocale',
    description: 'Permet d\'écouter un message vocal avant de l\'envoyer',
    envVar: 'FF_VOICE_PREVIEW',
    category: 'messaging',
  },
  {
    key: 'FF_TYPING_TTL',
    label: 'TTL indicateur de frappe',
    description: 'Expire automatiquement l\'indicateur "est en train d\'écrire" après 5 s',
    envVar: 'FF_TYPING_TTL',
    category: 'resilience',
  },
  {
    key: 'FF_DISPATCH_LOCK_TIMEOUT',
    label: 'Timeout mutex dispatch',
    description: 'Abandonne le lock de dispatch après 10 s pour éviter les blocages',
    envVar: 'FF_DISPATCH_LOCK_TIMEOUT',
    category: 'resilience',
  },
  {
    key: 'FF_SLA_CRON',
    label: 'Cron surveillance SLA',
    description: 'Détecte les conversations en breach SLA toutes les 5 minutes',
    envVar: 'FF_SLA_CRON',
    category: 'resilience',
  },
  {
    key: 'FF_TEMPLATE_GUARD',
    label: 'Guard statut template HSM',
    description: 'Bloque l\'envoi d\'un message auto si le template HSM n\'est pas APPROVED',
    envVar: 'FF_TEMPLATE_GUARD',
    category: 'messaging',
  },
  {
    key: 'FF_AUTO_MESSAGE_DLQ',
    label: 'Dead Letter Queue messages auto',
    description: 'Re-essaie les messages auto jusqu\'à 3 fois avant de les marquer failed',
    envVar: 'FF_AUTO_MESSAGE_DLQ',
    category: 'resilience',
  },
  {
    key: 'FF_REPLY_MESSAGE',
    label: 'Répondre à un message',
    description: 'Affiche le bouton Reply et scroll vers le message cité au clic',
    envVar: 'FF_REPLY_MESSAGE',
    category: 'messaging',
  },
];

@Injectable()
export class FeatureFlagService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(key: string): boolean {
    const raw = this.config.get<string>(key);
    return raw === 'true' || raw === '1';
  }

  getAllFlags(): FeatureFlagEntry[] {
    return FLAG_DEFINITIONS.map((def) => ({
      ...def,
      enabled: this.isEnabled(def.key),
    }));
  }
}
