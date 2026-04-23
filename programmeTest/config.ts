import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFiles = [
  process.env.PROGRAMMETEST_ENV,
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', 'message_whatsapp', '.env'),
].filter(Boolean) as string[];

for (const envFile of envFiles) {
  if (!fs.existsSync(envFile)) continue;
  const content = fs.readFileSync(envFile, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) continue;
    if (process.env[key] !== undefined) continue;
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

const env = process.env;

export type TestMode = 'messages' | 'status' | 'mix' | 'call' | 'obligations' | 'window' | 'ping';
export type ProviderConfig = 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram' | 'mix';

export const config = {
  // ── Provider selection ──────────────────────────────────────────────────
  // Valeurs: whapi | meta | messenger | instagram | telegram | mix
  // "mix" : distribue entre tous les providers listés dans mixProviders
  provider: (env.PROVIDER ?? 'whapi').toLowerCase() as ProviderConfig,

  // En mode mix, liste des providers actifs (séparés par virgule)
  // Ex: MIXED_PROVIDERS=whapi,meta,telegram
  // Par défaut: tous les 5 providers
  mixProviders: (env.MIXED_PROVIDERS ?? 'whapi,meta,messenger,instagram,telegram')
    .split(',')
    .map((p) => p.trim().toLowerCase()) as ProviderConfig[],

  // ── Test mode ───────────────────────────────────────────────────────────
  mode: (env.MODE ?? 'messages').toLowerCase() as TestMode,

  // ── Volume ──────────────────────────────────────────────────────────────
  conversationsCount: Number(env.CONVERSATIONS ?? 1),
  messagesPerConversation: Number(env.MESSAGES_PER_CONVERSATION ?? 2),
  parallelRequests: Number(env.PARALLEL_REQUESTS ?? 1),

  // ── Webhook URLs ────────────────────────────────────────────────────────
  webhookUrl:           env.WEBHOOK_URL           ?? 'http://148.230.112.175:3002/webhooks/whapi',
  metaWebhookUrl:       env.META_WEBHOOK_URL       ?? 'http://localhost:3002/webhooks/meta',
  messengerWebhookUrl:  env.MESSENGER_WEBHOOK_URL  ?? 'http://localhost:3002/webhooks/messenger',
  instagramWebhookUrl:  env.INSTAGRAM_WEBHOOK_URL  ?? 'http://localhost:3002/webhooks/instagram',
  // L'URL Telegram inclut le botId dynamiquement — voir index.ts
  telegramWebhookBase:  env.TELEGRAM_WEBHOOK_BASE  ?? 'http://localhost:3002/webhooks/telegram',

  // ── HMAC / Secrets ──────────────────────────────────────────────────────
  // Whapi
  whapiSecretHeader:    env.WHAPI_WEBHOOK_SECRET_HEADER ?? 'x-whapi-signature',
  whapiSecretValue:     env.WHAPI_WEBHOOK_SECRET_VALUE  ?? '',
  // Meta WhatsApp
  metaSecretValue:      env.WHATSAPP_APP_SECRET         ?? '',
  // Messenger + Instagram (META_APP_SECRET si différent, sinon même que Meta)
  messengerAppSecret:   env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET ?? '',
  instagramAppSecret:   env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET ?? '',
  // Telegram
  telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? '',

  // ── Channel / Account IDs ───────────────────────────────────────────────
  // Whapi
  channelId:          env.WHAPI_CHANNEL_ID       ?? 'AQUAMN-YDY35',
  // Meta WhatsApp
  metaPhoneNumberId:  env.META_PHONE_NUMBER_ID   ?? 'e2e-shadow-channel',
  metaWabaId:         env.META_WABA_ID           ?? 'waba-test',
  // Messenger
  messengerPageId:    env.MESSENGER_PAGE_ID      ?? 'test-page-id',
  // Instagram
  instagramAccountId: env.INSTAGRAM_ACCOUNT_ID  ?? 'test-ig-account-id',
  // Telegram
  telegramBotId:      env.TELEGRAM_BOT_ID       ?? 'test-bot-id',

  // ── DB mapping ──────────────────────────────────────────────────────────
  useDbMapping: (env.USE_DB_MAPPING ?? 'false').toLowerCase() === 'true',
  dbHost:     env.MYSQL_HOST     ?? 'localhost',
  dbPort:     Number(env.MYSQL_PORT ?? 3306),
  dbUser:     env.MYSQL_USER     ?? 'root',
  dbPassword: env.MYSQL_PASSWORD ?? '',
  dbName:     env.MYSQL_DATABASE ?? 'whatsappflow',

  // ── GICOP — Webhook appels ──────────────────────────────────────────────────
  gicopWebhookUrl:    env.GICOP_WEBHOOK_URL    ?? 'http://148.230.112.175:3002/webhooks/gicop',
  integrationSecret:  env.INTEGRATION_SECRET   ?? '',
  commercialPhone:    env.COMMERCIAL_PHONE      ?? '',
  posteId:            env.POSTE_ID              ?? '',
  clientPhones:       (env.CLIENT_PHONES ?? '').split(',').map(p => p.trim()).filter(Boolean),
  callDurationSeconds: Number(env.CALL_DURATION_SECONDS ?? 120),
  windowSize:         Number(env.WINDOW_SIZE    ?? 10),

  // ── Backward compat ─────────────────────────────────────────────────────
  /** @deprecated Utiliser mixProviders à la place */
  mixRatio: Number(env.MIX_RATIO ?? 0.5),
};
