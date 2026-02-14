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

export const config = {
  provider: (env.PROVIDER ?? 'whapi').toLowerCase() as 'whapi' | 'meta' | 'mix',
  webhookUrl: env.WEBHOOK_URL ?? 'http://localhost:3002/webhooks/whapi',
  metaWebhookUrl: env.META_WEBHOOK_URL ?? 'http://localhost:3002/webhooks/whatsapp',
  conversationsCount: Number(env.CONVERSATIONS ?? 1), // nombre de chats
  messagesPerConversation: Number(env.MESSAGES_PER_CONVERSATION ?? 2),
  parallelRequests: Number(env.PARALLEL_REQUESTS ?? 1),
  whapiSecretHeader: env.WHAPI_WEBHOOK_SECRET_HEADER ?? 'x-whapi-signature',
  whapiSecretValue: env.WHAPI_WEBHOOK_SECRET_VALUE ?? '',
  metaSecretValue: env.WHATSAPP_APP_SECRET ?? '',
  channelId: env.WHAPI_CHANNEL_ID ?? 'e2e-shadow-channel',
  metaPhoneNumberId: env.META_PHONE_NUMBER_ID ?? 'e2e-shadow-channel',
  metaWabaId: env.META_WABA_ID ?? 'waba-test',
  useDbMapping: (env.USE_DB_MAPPING ?? 'false').toLowerCase() === 'true',
  dbHost: env.MYSQL_HOST ?? 'localhost',
  dbPort: Number(env.MYSQL_PORT ?? 3306),
  dbUser: env.MYSQL_USER ?? 'root',
  dbPassword: env.MYSQL_PASSWORD ?? '',
  dbName: env.MYSQL_DATABASE ?? 'whatsappflow',
};
