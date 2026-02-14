# Plan Chaos Test - Webhook Multi-Provider

Date: 2026-02-14

## Objectif
Valider la degradation controlee en cas d'incident (DB lente, WS crash, retries provider).

## Scenarios
1. DB latency: ajouter 300-500 ms sur queries critiques
2. Crash WS gateway: arret du gateway puis redemarrage
3. Replay storm: meme event x10
4. Provider retry: bursts repetees

## Validation
- Aucune fuite cross-tenant
- Aucun drop de messages critique
- Reponses 202/429 correctes en surcharge
- Mode degrade active si p95 > 800 ms

## Evidences
- Logs et metrics
- Timeline incident
- Rapport de validation
