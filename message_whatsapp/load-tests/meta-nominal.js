import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WABA_ID = __ENV.WABA_ID || 'waba-load';
const PHONE_ID = __ENV.PHONE_ID || 'phone-load';
const SECRET = __ENV.META_SECRET || 'meta-secret';

export const options = {
  vus: 20,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<400', 'p(99)<900'],
    http_req_failed: ['rate<0.01'],
  },
};

function sign(body) {
  const digest = crypto.hmac('sha256', SECRET, body, 'hex');
  return `sha256=${digest}`;
}

export default function () {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+225000000',
                phone_number_id: PHONE_ID,
              },
              contacts: [
                {
                  wa_id: `2250700${__VU}${__ITER}`,
                  profile: { name: 'Load Test' },
                },
              ],
              messages: [
                {
                  from: `2250700${__VU}${__ITER}`,
                  id: `meta-${__VU}-${__ITER}`,
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  type: 'text',
                  text: { body: 'meta-load' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'x-hub-signature-256': sign(body),
  };

  const res = http.post(`${BASE_URL}/webhooks/whatsapp`, body, { headers });
  check(res, {
    'status is 200/201': (r) => r.status === 200 || r.status === 201,
  });
  sleep(0.3);
}
