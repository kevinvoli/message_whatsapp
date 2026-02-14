# Plan Tests Charge - Webhook Multi-Provider

Date: 2026-02-14

## Prerequis
- Instances applicatives demarrees.
- Mapping tenant/channel valide en DB.
- Secrets configures.
- Outil k6 installe.

## Scenarios
1. Nominal Whapi: 2000 msg/min
2. Stress Whapi: 5000 msg/min
3. Nominal Meta: 2000 msg/min (optionnel)

## Execution
```bash
# Nominal Whapi
k6 run message_whatsapp/load-tests/whapi-nominal.js \
  -e BASE_URL=http://localhost:3000 \
  -e CHANNEL_ID=your-channel-id \
  -e WHAPI_SECRET=your-secret \
  -e WHAPI_HEADER=x-whapi-signature

# Stress Whapi
k6 run message_whatsapp/load-tests/whapi-stress.js \
  -e BASE_URL=http://localhost:3000 \
  -e CHANNEL_ID=your-channel-id \
  -e WHAPI_SECRET=your-secret \
  -e WHAPI_HEADER=x-whapi-signature

# Nominal Meta
k6 run message_whatsapp/load-tests/meta-nominal.js \
  -e BASE_URL=http://localhost:3000 \
  -e WABA_ID=your-waba-id \
  -e PHONE_ID=your-phone-id \
  -e META_SECRET=your-meta-secret
```

## Validation
- p95 <= 400 ms, p99 <= 900 ms (nominal)
- error_rate < 1%
- duplicate_rate < 1%

## Evidences
- Export k6 summary
- Capture Prometheus/Grafana (SLO)
