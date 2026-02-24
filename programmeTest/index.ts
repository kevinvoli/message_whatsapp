import axios from 'axios';
import { createHmac } from 'crypto';
import mysql from 'mysql2/promise';
import { config } from './config.js';
import { generateChatIds } from './generator.js';
import {
  generateWhapiMessagePayload,
  generateWhapiRandomMessagePayload,
  generateWhapiStatusPayload,
  generateMetaWebhookPayload,
  generateMetaRandomMessagePayload,
  generateMetaStatusWebhookPayload,
} from './webhook.js';
import { stats } from './stats-instance.js';
import { WhapiWebhookPayload, MetaWebhookPayload } from './payload.js';

type AnyPayload = WhapiWebhookPayload | MetaWebhookPayload;
type Provider = 'whapi' | 'meta';
type Envelope = { provider: Provider; payload: AnyPayload };

// ============================================================
// DB mapping
// ============================================================

async function resolveMapping() {
  if (!config.useDbMapping) {
    return {
      channelId: config.channelId,
      metaPhoneNumberId: config.metaPhoneNumberId,
      metaWabaId: config.metaWabaId,
    };
  }

  const connection = await mysql.createConnection({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
  });

  try {
    let channelId = config.channelId;
    let metaPhoneNumberId = config.metaPhoneNumberId;
    let metaWabaId = config.metaWabaId;

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

    const [metaRows] = await connection.query(
      "SELECT external_id, channel_id FROM channels WHERE provider='meta' AND external_id IS NOT NULL LIMIT 1",
    );
    if (Array.isArray(metaRows) && metaRows.length > 0) {
      metaWabaId = (metaRows[0] as any).external_id ?? metaWabaId;
      metaPhoneNumberId = (metaRows[0] as any).channel_id ?? metaPhoneNumberId;
    }

    return { channelId, metaPhoneNumberId, metaWabaId };
  } finally {
    await connection.end();
  }
}

// ============================================================
// Send message
// ============================================================

export async function sendMessage(envelope: Envelope) {
  stats.sent++;
  const startMs = Date.now();

  try {
    const url =
      envelope.provider === 'meta'
        ? config.metaWebhookUrl
        : config.webhookUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'StressTest/2.0',
    };

    const rawBody = JSON.stringify(envelope.payload);

    if (envelope.provider === 'whapi') {
      if (!config.whapiSecretValue) {
        throw new Error('WHAPI_WEBHOOK_SECRET_VALUE missing');
      }
      const digest = createHmac('sha256', config.whapiSecretValue)
        .update(rawBody)
        .digest('hex');
      headers[config.whapiSecretHeader] = `sha256=${digest}`;
    } else {
      if (!config.metaSecretValue) {
        throw new Error('WHATSAPP_APP_SECRET missing');
      }
      const digest = createHmac('sha256', config.metaSecretValue)
        .update(rawBody)
        .digest('hex');
      headers['x-hub-signature-256'] = `sha256=${digest}`;
    }

    console.log("envelope:", envelope.payload);
    
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
// Envelope builders per mode
// ============================================================

function pickProvider(): Provider {
  if (config.provider === 'mix') {
    return Math.random() < config.mixRatio ? 'whapi' : 'meta';
  }
  return config.provider === 'meta' ? 'meta' : 'whapi';
}

function buildMessageEnvelope(chatId: string): Envelope {
  const provider = pickProvider();
  const from = chatId.split('@')[0];
  const name = `Bot ${Math.random().toString(36).slice(2)}`;

  if (config.mode === 'mix') {
    // Mix mode: random message types
    if (provider === 'whapi') {
      return { provider, payload: generateWhapiRandomMessagePayload(chatId) };
    }
    return { provider: 'meta', payload: generateMetaRandomMessagePayload(from, name) };
  }

  // Default: text messages
  if (provider === 'whapi') {
    return { provider, payload: generateWhapiMessagePayload(chatId) };
  }
  return {
    provider: 'meta',
    payload: generateMetaWebhookPayload({
      from,
      name,
      messageId: `wamid.${Date.now()}-${Math.random().toString(16).slice(2)}`,
      body: `Message de test ${Math.random().toString(36).slice(2)}`,
    }),
  };
}

function buildStatusEnvelope(chatId: string): Envelope {
  const provider = pickProvider();
  const from = chatId.split('@')[0];

  if (provider === 'whapi') {
    return { provider, payload: generateWhapiStatusPayload(chatId) };
  }
  return {
    provider: 'meta',
    payload: generateMetaStatusWebhookPayload(from),
  };
}

function buildEnvelope(chatId: string): Envelope {
  switch (config.mode) {
    case 'status':
      return buildStatusEnvelope(chatId);
    case 'mix':
      // Mix alternates between messages and statuses
      return Math.random() < 0.7
        ? buildMessageEnvelope(chatId)
        : buildStatusEnvelope(chatId);
    default:
      return buildMessageEnvelope(chatId);
  }
}

// ============================================================
// Main
// ============================================================

export async function runStressTest() {
  console.warn(
    `\nDemarrage stress test | provider=${config.provider} mode=${config.mode} conversations=${config.conversationsCount} messages=${config.messagesPerConversation} parallel=${config.parallelRequests}`,
  );
  if (config.provider === 'mix') {
    console.warn(`Mix ratio (whapi probability): ${config.mixRatio}`);
  }

  const mapping = await resolveMapping();
  (config as any).channelId = mapping.channelId;
  (config as any).metaPhoneNumberId = mapping.metaPhoneNumberId;
  (config as any).metaWabaId = mapping.metaWabaId;

  const chatIds = generateChatIds(config.conversationsCount);
  const batch: Promise<void>[] = [];

  for (const chatId of chatIds) {
    for (let i = 0; i < config.messagesPerConversation; i++) {
      batch.push(sendMessage(buildEnvelope(chatId)));

      if (batch.length >= config.parallelRequests) {
        await Promise.all(batch);
        batch.length = 0;
      }
    }
  }

  if (batch.length) await Promise.all(batch);

  console.log('\nStress test termine');
  console.table(stats.summary());

  if (stats.failedMessages.length) {
    console.log('\nDETAIL DES ECHECS');
    console.table(
      stats.failedMessages.map((f, i) => ({
        '#': i + 1,
        type: f.errorType,
        status: f.statusCode ?? '-',
        message: f.errorMessage.slice(0, 80),
        chat_id: f.chatId,
      })),
    );
  }
}

runStressTest();
