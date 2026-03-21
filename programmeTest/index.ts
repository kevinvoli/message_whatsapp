import axios from 'axios';
import { createHmac } from 'crypto';
import mysql from 'mysql2/promise';
import { config } from './config.js';
import { generateChatIds, generateNumericIds } from './generator.js';
import {
  generateWhapiMessagePayload,
  generateWhapiRandomMessagePayload,
  generateWhapiStatusPayload,
  generateMetaWebhookPayload,
  generateMetaRandomMessagePayload,
  generateMetaStatusWebhookPayload,
  generateMessengerWebhookPayload,
  generateMessengerRandomWebhookPayload,
  generateMessengerStatusWebhookPayload,
  generateInstagramWebhookPayload,
  generateInstagramRandomWebhookPayload,
  generateInstagramStatusWebhookPayload,
  generateTelegramWebhookPayload,
  generateTelegramRandomWebhookPayload,
} from './webhook.js';
import { stats } from './stats-instance.js';
import {
  WhapiWebhookPayload,
  MetaWebhookPayload,
  MessengerWebhookPayload,
  InstagramWebhookPayload,
  TelegramWebhookPayload,
} from './payload.js';

type Provider = 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram';
type AnyPayload =
  | WhapiWebhookPayload
  | MetaWebhookPayload
  | MessengerWebhookPayload
  | InstagramWebhookPayload
  | TelegramWebhookPayload;

type Envelope = { provider: Provider; payload: AnyPayload };

// ============================================================
// DB mapping
// ============================================================

async function resolveMapping() {
  if (!config.useDbMapping) {
    return {
      channelId:          config.channelId,
      metaPhoneNumberId:  config.metaPhoneNumberId,
      metaWabaId:         config.metaWabaId,
      messengerPageId:    config.messengerPageId,
      instagramAccountId: config.instagramAccountId,
      telegramBotId:      config.telegramBotId,
    };
  }

  const connection = await mysql.createConnection({
    host:     config.dbHost,
    port:     config.dbPort,
    user:     config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
  });

  try {
    let channelId          = config.channelId;
    let metaPhoneNumberId  = config.metaPhoneNumberId;
    let metaWabaId         = config.metaWabaId;
    let messengerPageId    = config.messengerPageId;
    let instagramAccountId = config.instagramAccountId;
    let telegramBotId      = config.telegramBotId;

    // Whapi
    const [whapiRows] = await connection.query(
      'SELECT channel_id FROM whapi_channels WHERE channel_id IS NOT NULL LIMIT 1',
    );
    if (Array.isArray(whapiRows) && whapiRows.length > 0) {
      channelId = (whapiRows[0] as any).channel_id ?? channelId;
    } else {
      const [channelsRows] = await connection.query(
        "SELECT channel_id FROM channels WHERE provider='whapi' AND channel_id IS NOT NULL LIMIT 1",
      );
      if (Array.isArray(channelsRows) && channelsRows.length > 0) {
        channelId = (channelsRows[0] as any).channel_id ?? channelId;
      }
    }

    // Meta WhatsApp
    const [metaRows] = await connection.query(
      "SELECT external_id, channel_id FROM channels WHERE provider='meta' AND external_id IS NOT NULL LIMIT 1",
    );
    if (Array.isArray(metaRows) && metaRows.length > 0) {
      metaWabaId        = (metaRows[0] as any).external_id ?? metaWabaId;
      metaPhoneNumberId = (metaRows[0] as any).channel_id  ?? metaPhoneNumberId;
    }

    // Messenger
    const [messengerRows] = await connection.query(
      "SELECT external_id FROM channels WHERE provider='messenger' AND external_id IS NOT NULL LIMIT 1",
    );
    if (Array.isArray(messengerRows) && messengerRows.length > 0) {
      messengerPageId = (messengerRows[0] as any).external_id ?? messengerPageId;
    }

    // Instagram
    const [igRows] = await connection.query(
      "SELECT external_id FROM channels WHERE provider='instagram' AND external_id IS NOT NULL LIMIT 1",
    );
    if (Array.isArray(igRows) && igRows.length > 0) {
      instagramAccountId = (igRows[0] as any).external_id ?? instagramAccountId;
    }

    // Telegram
    const [tgRows] = await connection.query(
      "SELECT external_id FROM channels WHERE provider='telegram' AND external_id IS NOT NULL LIMIT 1",
    );
    if (Array.isArray(tgRows) && tgRows.length > 0) {
      telegramBotId = (tgRows[0] as any).external_id ?? telegramBotId;
    }

    return { channelId, metaPhoneNumberId, metaWabaId, messengerPageId, instagramAccountId, telegramBotId };
  } finally {
    await connection.end();
  }
}

// ============================================================
// HMAC signing + URL resolution per provider
// ============================================================

function getWebhookUrl(provider: Provider): string {
  switch (provider) {
    case 'whapi':     return config.webhookUrl;
    case 'meta':      return config.metaWebhookUrl;
    case 'messenger': return config.messengerWebhookUrl;
    case 'instagram': return config.instagramWebhookUrl;
    case 'telegram':  return `${config.telegramWebhookBase}/${config.telegramBotId}`;
  }
}

function signPayload(provider: Provider, rawBody: string): Record<string, string> {
  switch (provider) {
    case 'whapi': {
      if (!config.whapiSecretValue) throw new Error('WHAPI_WEBHOOK_SECRET_VALUE manquant');
      const digest = createHmac('sha256', config.whapiSecretValue).update(rawBody).digest('hex');
      return { [config.whapiSecretHeader]: `sha256=${digest}` };
    }
    case 'meta': {
      if (!config.metaSecretValue) return {}; // dev mode: backend skips signature check
      const digest = createHmac('sha256', config.metaSecretValue).update(rawBody).digest('hex');
      return { 'x-hub-signature-256': `sha256=${digest}` };
    }
    case 'messenger': {
      if (!config.messengerAppSecret) throw new Error('META_APP_SECRET / WHATSAPP_APP_SECRET manquant pour Messenger');
      const digest = createHmac('sha256', config.messengerAppSecret).update(rawBody).digest('hex');
      return { 'x-hub-signature-256': `sha256=${digest}` };
    }
    case 'instagram': {
      if (!config.instagramAppSecret) throw new Error('META_APP_SECRET / WHATSAPP_APP_SECRET manquant pour Instagram');
      const digest = createHmac('sha256', config.instagramAppSecret).update(rawBody).digest('hex');
      return { 'x-hub-signature-256': `sha256=${digest}` };
    }
    case 'telegram': {
      // Header optionnel (seulement si TELEGRAM_WEBHOOK_SECRET est configuré)
      if (!config.telegramWebhookSecret) return {};
      return { 'x-telegram-bot-api-secret-token': config.telegramWebhookSecret };
    }
  }
}

// ============================================================
// Send message
// ============================================================

export async function sendMessage(envelope: Envelope) {
  stats.sent++;
  const startMs = Date.now();

  try {
    const url     = getWebhookUrl(envelope.provider);
    const rawBody = JSON.stringify(envelope.payload);
    const sigHeaders = signPayload(envelope.provider, rawBody);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'StressTest/2.0',
      ...sigHeaders,
    };

    console.log(`[${envelope.provider}] → ${url}`);

    const res = await axios.post(url, envelope.payload, {
      validateStatus: () => true,
      headers,
    });

    stats.recordLatency(Date.now() - startMs);

    if (res.status >= 200 && res.status < 300) {
      stats.recordSuccess(res);
    } else {
      const error = new Error(res.data?.message || `HTTP ${res.status}`);
      (error as any).statusCode = res.status;
      stats.recordFailure(error, envelope.payload);
    }
  } catch (err: any) {
    stats.recordLatency(Date.now() - startMs);
    stats.recordFailure(err, envelope.payload);
  }
}

// ============================================================
// Provider picking
// ============================================================

function pickProvider(): Provider {
  const p = config.provider;

  if (p !== 'mix') {
    // Provider unique forcé
    return p as Provider;
  }

  // Mix : pick uniformément parmi mixProviders
  const pool = config.mixProviders.filter(
    (x): x is Provider => x !== 'mix',
  );
  if (pool.length === 0) return 'whapi';
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================
// Envelope builders
// ============================================================

/**
 * Génère un identifiant de "conversation" au bon format selon le provider.
 * - whapi/meta  → phone string (ex: "2250700000000")
 * - messenger   → PSID string (ex: "1234567890")
 * - instagram   → IGSID string
 * - telegram    → chat_id number
 */
function makeUserId(provider: Provider, numericId: number): string | number {
  switch (provider) {
    case 'whapi':
    case 'meta':
      // Ré-utiliser le format phone ivoirien
      return `225${String(numericId).slice(0, 9)}`;
    case 'messenger':
    case 'instagram':
      return String(numericId);
    case 'telegram':
      return numericId;
  }
}

function buildMessageEnvelope(provider: Provider, numericId: number): Envelope {
  const userId = makeUserId(provider, numericId);

  if (config.mode === 'mix') {
    // mode mix : types variés
    switch (provider) {
      case 'whapi':
        return { provider, payload: generateWhapiRandomMessagePayload(`${userId}@s.whatsapp.net`) };
      case 'meta': {
        const from = String(userId);
        return { provider, payload: generateMetaRandomMessagePayload(from, `User${from}`) };
      }
      case 'messenger':
        return { provider, payload: generateMessengerRandomWebhookPayload(String(userId)) };
      case 'instagram':
        return { provider, payload: generateInstagramRandomWebhookPayload(String(userId)) };
      case 'telegram':
        return { provider, payload: generateTelegramRandomWebhookPayload(Number(userId)) };
    }
  }

  // mode messages : texte simple
  switch (provider) {
    case 'whapi':
      return { provider, payload: generateWhapiMessagePayload(`${userId}@s.whatsapp.net`) };
    case 'meta': {
      const from = String(userId);
      return {
        provider,
        payload: generateMetaWebhookPayload({
          from,
          name: `User${from}`,
          messageId: `wamid.${Date.now()}-${Math.random().toString(16).slice(2)}`,
          body: `Message de test ${Math.random().toString(36).slice(2)}`,
        }),
      };
    }
    case 'messenger':
      return { provider, payload: generateMessengerWebhookPayload(String(userId)) };
    case 'instagram':
      return { provider, payload: generateInstagramWebhookPayload(String(userId)) };
    case 'telegram':
      return { provider, payload: generateTelegramWebhookPayload(Number(userId)) };
  }
}

function buildStatusEnvelope(provider: Provider, numericId: number): Envelope {
  const userId = makeUserId(provider, numericId);

  switch (provider) {
    case 'whapi':
      return { provider, payload: generateWhapiStatusPayload(`${userId}@s.whatsapp.net`) };
    case 'meta':
      return { provider, payload: generateMetaStatusWebhookPayload(String(userId)) };
    case 'messenger':
      return { provider, payload: generateMessengerStatusWebhookPayload(String(userId)) };
    case 'instagram':
      return { provider, payload: generateInstagramStatusWebhookPayload(String(userId)) };
    case 'telegram':
      // Telegram n'a pas de delivery/read receipts → on envoie un message texte à la place
      return { provider, payload: generateTelegramWebhookPayload(Number(userId)) };
  }
}

function buildEnvelope(provider: Provider, numericId: number): Envelope {
  switch (config.mode) {
    case 'status':
      return buildStatusEnvelope(provider, numericId);
    case 'mix':
      return Math.random() < 0.7
        ? buildMessageEnvelope(provider, numericId)
        : buildStatusEnvelope(provider, numericId);
    default:
      return buildMessageEnvelope(provider, numericId);
  }
}

// ============================================================
// Main
// ============================================================

export async function runStressTest() {
  const activeProvider = config.provider;
  const mixLabel =
    activeProvider === 'mix'
      ? ` [${config.mixProviders.join(', ')}]`
      : '';

  console.warn(
    `\nDémarrage stress test | provider=${activeProvider}${mixLabel} mode=${config.mode}` +
    ` conversations=${config.conversationsCount} messages=${config.messagesPerConversation}` +
    ` parallel=${config.parallelRequests}`,
  );

  const mapping = await resolveMapping();
  (config as any).channelId          = mapping.channelId;
  (config as any).metaPhoneNumberId  = mapping.metaPhoneNumberId;
  (config as any).metaWabaId         = mapping.metaWabaId;
  (config as any).messengerPageId    = mapping.messengerPageId;
  (config as any).instagramAccountId = mapping.instagramAccountId;
  (config as any).telegramBotId      = mapping.telegramBotId;

  console.warn('Mapping résolu :');
  console.warn(`  whapi        channel_id     = ${mapping.channelId}`);
  console.warn(`  meta         phone_number_id= ${mapping.metaPhoneNumberId}`);
  console.warn(`  messenger    page_id        = ${mapping.messengerPageId}`);
  console.warn(`  instagram    account_id     = ${mapping.instagramAccountId}`);
  console.warn(`  telegram     bot_id         = ${mapping.telegramBotId}`);

  // Génération des IDs numériques (valides pour tous les providers)
  const numericIds = generateNumericIds(config.conversationsCount);
  const batch: Promise<void>[] = [];

  for (const numericId of numericIds) {
    for (let i = 0; i < config.messagesPerConversation; i++) {
      const provider = pickProvider();
      batch.push(sendMessage(buildEnvelope(provider, numericId)));

      if (batch.length >= config.parallelRequests) {
        await Promise.all(batch);
        batch.length = 0;
      }
    }
  }

  if (batch.length) await Promise.all(batch);

  console.log('\nStress test terminé');
  console.table(stats.summary());

  if (stats.failedMessages.length) {
    console.log('\nDÉTAIL DES ÉCHECS');
    console.table(
      stats.failedMessages.map((f, i) => ({
        '#': i + 1,
        type:    f.errorType,
        status:  f.statusCode ?? '-',
        message: f.errorMessage.slice(0, 80),
        chat_id: f.chatId,
      })),
    );
  }
}

runStressTest();
