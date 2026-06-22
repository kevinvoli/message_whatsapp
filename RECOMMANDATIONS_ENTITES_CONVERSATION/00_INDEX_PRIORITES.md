# Index des recommandations - Entites conversationnelles

Date : 2026-06-22

## Perimetre

Ces fichiers couvrent les ameliorations autour de :

- `WhatsappMessage`
- `WhatsappChat`
- `ChatSession`
- `Contact`
- `ConversationReport`
- tables liees aux rapports, dossiers client, validations, follow-up, audit et integration.

Note : dans le code et le dump fourni, je ne vois pas d'entite nommee `whatsapp_report`. Le concept correspondant semble etre `conversation_report`, avec des integrations vers `messaging_client_dossier_mirror`, `integration_outbox`, `integration_sync_log`, `client_dossier`, `follow_up` et `conversation_validation`.

## Fichiers crees

1. `01_PRIORITE_URGENTE_SECURISATION.md`
   - A traiter en premier.
   - Objectif : eviter les collisions, divergences d'etat et erreurs multi-tenant.

2. `02_STRUCTURE_ENTITES_GARDER_DEPLACER.md`
   - Recommandations sur la structure des trois entites.
   - Contient les sections demandees : ce qu'il faut garder et ce qu'il faut deplacer progressivement.

3. `03_INTERACTIONS_CONTACT_REPORT_DOSSIER.md`
   - Recommandations sur les interactions avec `Contact`, `ConversationReport`, `ClientDossier`, `FollowUp` et les tables d'integration.

4. `04_RECONCILIATION_AUDIT_ANALYTICS.md`
   - Jobs de reconciliation, audit, snapshots et controle qualite des donnees.

5. `05_NETTOYAGE_BDD_REPORTABLE.md`
   - Ce qui peut etre reporte.
   - Tables a reutiliser, a fusionner, a auditer avant suppression, et candidates legacy.

6. `06_STRATEGIE_MIGRATION_PROD_SANS_PERTE.md`
   - Strategie de migration progressive pour eviter toute perte de donnees en production.
   - Contient les phases backup, migration additive, backfill, double ecriture, verification et rollback.

7. `07_EXPLOITATION_AVANCEE_CHAT_SESSION.md`
   - Propositions metier avancees autour de `ChatSession` : rapport par session, resume IA, notation commercial/client, relances et classification client dans le temps.

8. `08_ENTITES_SOUS_EXPLOITEES_OPPORTUNITES.md`
   - Propositions d'exploitation pour les entites sous-utilisees : medias, campagnes, SLA, taches commerciales, validation, audit IA, outbox, opt-out et attribution marketing.

## Priorisation globale

### Urgent

- Clarifier les identifiants `message_id`, `external_id`, `provider_message_id`.
- Verrouiller les recherches critiques avec `tenant_id`, `provider`, `direction`.
- Stabiliser `WhatsappChat.activeSessionId` et `ChatSession`.
- Ajouter une reconciliation minimale des champs denormalises.
- Clarifier la source de verite entre `WhatsappChat`, `WhatsappMessage` et `ChatSession`.

### Important mais non bloquant

- Deplacer progressivement les lectures, evenements provider, analyses IA et transitions de conversation vers des tables dediees.
- Renforcer les liens avec `Contact`, `ConversationReport` et `ClientDossier`.
- Ameliorer les index et contraintes.

### Reportable

- Nettoyage des anciennes tables legacy.
- Fusion des tables historiques non utilisees.
- Refonte large des noms de colonnes.
- Suppression de tables apres audit d'usage reel.
