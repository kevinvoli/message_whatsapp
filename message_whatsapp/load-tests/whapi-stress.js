import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CHANNEL_ID = __ENV.CHANNEL_ID || 'load-test-channel';
const SECRET = __ENV.WHAPI_SECRET || 'secret';
const HEADER = (__ENV.WHAPI_HEADER || 'x-whapi-signature').toLowerCase();

export const options = {
  vus: 60,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1200'],
    http_req_failed: ['rate<0.05'],
  },
};

function sign(body) {
  const digest = crypto.hmac('sha256', SECRET, body, 'hex');
  return `sha256=${digest}`;
}

export default function () {
  const payload = {
    channel_id: CHANNEL_ID,
    event: { type: 'messages', event: 'messages' },
    messages: [
      {
        id: `stress-${__VU}-${__ITER}`,
        chat_id: `2250700${__VU}${__ITER}@s.whatsapp.net`,
        from_me: false,
        from: `2250700${__VU}${__ITER}`,
        from_name: 'Load Test',
        timestamp: Math.floor(Date.now() / 1000),
        type: 'text',
        text: { body: 'stress-test' },
      },
    ],
  };

  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
  };
  headers[HEADER] = sign(body);

  const res = http.post(`${BASE_URL}/webhooks/whapi`, body, { headers });
  check(res, {
    'status is 200/201/202/429': (r) =>
      [200, 201, 202, 429].includes(r.status),
  });
  sleep(0.1);
}
