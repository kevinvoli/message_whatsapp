# Plan de Refactor Double DB et Nettoyage du Code

Date: 2026-04-24

## Objectif

Ce document complete le plan d'implementation double base de donnees avec:

- l'impact sur le code existant
- les modules qui deviennent obsoletes
- le code mort ou redondant
- les elements a supprimer
- les elements a refactorer

Le principe retenu est:

- lecture directe des tables metier de la base commande
- ecriture uniquement dans des tables miroir dediees dans la base commande
- suppression progressive des integrations HTTP et webhook qui deviennent inutiles

## Conclusion d'analyse

Le code actuel contient deja une couche d'integration ERP/GICOP orientee:

- webhook entrant
- webhook sortant
- mappings manuels
- soumission HTTP des rapports

Avec le nouveau plan double DB, une partie importante de cette couche devient:

- obsolete
- redondante
- ou a refactorer en couche de lecture/ecriture base commande

Il ne faut pas tout supprimer d'un bloc. Il faut distinguer:

- ce qui devient inutile
- ce qui doit etre remplace
- ce qui doit etre conserve mais renomme ou recable

## Impact architectural sur le code existant

## Ce qui reste valide

Les parties suivantes restent structurellement bonnes:

- `gicop-report` comme domaine fonctionnel de rapport conversationnel
- `client-dossier`
- `follow-up`
- `call-obligations`
- `window`
- `conversation-capacity`
- `commercial-session`

Elles doivent surtout changer de mode d'integration, pas disparaitre.

## Ce qui devient obsolete avec la strategie double DB

La logique suivante devient obsolete si vous confirmez que:

- les commandes sont lues directement en DB
- les appels sont lus directement en DB
- les rapports sont copies directement en DB miroir

Alors les integrations HTTP suivantes ne sont plus necessaires:

- webhook entrant ERP/GICOP pour les evenements commande
- webhook entrant d'appels si `call_logs` est lu directement en DB
- webhook sortant ERP
- soumission HTTP du rapport vers la plateforme commande

## Modules et fichiers a supprimer ou a refactorer

## 1. `inbound-integration`

### Etat

Principalement concu pour recevoir des evenements ERP via webhook puis les appliquer localement.

### Analyse

Avec la lecture directe de la base commande:

- ce module n'est plus la bonne porte d'entree
- les mises a jour type `order_created`, `order_updated`, `order_cancelled`, `client_order_summary_updated`, `client_certification_updated`, `referral_updated` ne doivent plus arriver par POST, mais etre lues depuis la base commande

### Recommendation

- supprimer le module `InboundIntegrationModule`
- supprimer `InboundIntegrationService`
- remplacer ses usages par des services de lecture DB commande

### Niveau de suppression

`A supprimer`

Fichiers concernes:

- [inbound-integration.module.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/inbound-integration/inbound-integration.module.ts:1)
- [inbound-integration.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/inbound-integration/inbound-integration.service.ts:1)

## 2. `gicop-webhook`

### Etat

Ce module sert aujourd'hui de point d'entree HTTP pour:

- les evenements ERP
- les notifications d'appels

### Analyse

Dans le nouveau plan:

- les evenements commande sont lus directement dans la base `commandes`
- les appels sont lus directement dans la table `call_logs`

Donc ce module n'a plus de role central.

### Recommendation

Si la decision DB-only est confirmee:

- supprimer `GicopWebhookModule`
- supprimer `GicopWebhookController`
- supprimer `GicopWebhookService`
- supprimer `gicop-webhook.dto.ts`

### Exception

Si vous gardez une solution hybride temporaire pour les appels temps reel:

- conserver uniquement l'endpoint d'appel temporairement
- supprimer la partie webhook generique ERP

### Niveau de suppression

`A supprimer` si DB-only confirme  
`A reduire fortement` si hybride temporaire

Fichiers concernes:

- [gicop-webhook.module.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-webhook/gicop-webhook.module.ts:1)
- [gicop-webhook.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-webhook/gicop-webhook.controller.ts:1)
- [gicop-webhook.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-webhook/gicop-webhook.service.ts:1)
- [gicop-webhook.dto.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-webhook/dto/gicop-webhook.dto.ts:1)

## 3. `integration` module

### Etat

Ce module contient deux responsabilites:

- mappings d'identifiants
- dispatch HTTP vers ERP

### Analyse

La partie mappings peut rester utile.

La partie envoi HTTP vers ERP devient obsolete.

### Recommendation

- conserver la partie mapping
- supprimer la partie dispatch HTTP
- renommer le module ensuite en quelque chose de type:
  - `order-mapping`
  - `cross-db-mapping`

### A supprimer dans ce module

- `dispatchToErp`
- `dispatchLeadCreated`
- `dispatchClientUpdated`
- `dispatchConversationStatusChanged`
- `dispatchFollowUpCreated`
- `dispatchFollowUpCompleted`
- les listeners qui appellent ces methodes

### A conserver / refactorer

- `ClientIdentityMapping`
- `CommercialIdentityMapping`
- methodes `resolve*`
- methodes `upsert*` si les mappings restent necessaires

### Niveau de suppression

`Partiellement a supprimer`

Fichiers concernes:

- [integration.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/integration/integration.service.ts:1)
- [integration.listener.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/integration/integration.listener.ts:1)
- [integration.module.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/integration/integration.module.ts:1)
- [integration.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/integration/integration.controller.ts:1)

## 4. `outbound-webhook`

### Etat

Systeme generique de webhooks sortants.

### Analyse

Pour l'integration ERP/GICOP specifiquee ici, ce module n'est plus necessaire.

Mais il peut encore servir si:

- le produit garde une fonction generique de webhooks pour d'autres integrations
- d'autres tenants ou cas d'usage en ont besoin

### Recommendation

- ne pas supprimer tout de suite ce module du projet sans verification transverse
- le sortir du perimetre prioritaire GICOP
- retirer sa place des flux GICOP si aujourd'hui il y est encore lie fonctionnellement

### Niveau de suppression

`Pas a supprimer immediatement`

### Action

- debrancher du plan GICOP
- garder seulement si fonctionnalite produit encore utile

Fichiers concernes:

- [outbound-webhook.module.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/outbound-webhook/outbound-webhook.module.ts:1)
- [outbound-webhook.listener.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/outbound-webhook/outbound-webhook.listener.ts:1)
- [outbound-webhook.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/outbound-webhook/outbound-webhook.service.ts:1)

## 5. Soumission HTTP des rapports

### Etat

Le rapport est aujourd'hui pousse vers la plateforme commande via `OrderPlatformSyncService` avec `axios.post`.

### Analyse

Cette logique est contradictoire avec le nouveau plan double DB.

### Recommendation

- supprimer la logique HTTP de `OrderPlatformSyncService`
- remplacer ce service par un service d'ecriture en base commande
- conserver `ReportSubmissionService` mais changer son backend d'execution

### A supprimer

- `axios.post` vers `ORDER_PLATFORM_REPORT_URL`
- la dependance au endpoint externe

### A refactorer

- `OrderPlatformSyncService` devient `OrderPlatformMirrorWriteService`
- `submitReport()` ecrit dans la table miroir au lieu d'appeler une URL

### Niveau de suppression

`A refactorer fortement`

Fichiers concernes:

- [report-submission.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-report/report-submission.service.ts:1)
- [order-platform-sync.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-report/order-platform-sync.service.ts:1)

## 6. `GicopSupervisionView`

### Etat

Vue admin de supervision:

- fermetures bloquees
- rapports en echec de soumission
- rappel du endpoint `/webhooks/gicop/call-events`

### Analyse

La vue n'est pas a supprimer, mais son contenu doit changer.

Le bloc qui documente le endpoint webhook d'appel devient faux si vous passez en lecture DB.

### Recommendation

- conserver la vue
- remplacer les references webhook par:
  - etat de lecture DB appels
  - etat de synchro DB miroir rapports

### Niveau de suppression

`A refactorer`

Fichier concerne:

- [GicopSupervisionView.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/admin/src/app/ui/GicopSupervisionView.tsx:1)

## 7. `IntegrationView` admin

### Etat

Vue admin orientee:

- mappings ERP
- webhook entrant GICOP
- webhook sortant ERP

### Analyse

Dans le nouveau plan, la partie explication webhook devient obsolete.

La partie mapping peut rester utile si la correspondance UUID <-> IDs externes est toujours necessaire.

### Recommendation

- conserver si les mappings restent utiles
- renommer la vue en:
  - `Mappings Inter-DB`
  - ou `Correspondances`
- supprimer toute documentation d'endpoint webhook de cette vue

### Niveau de suppression

`Partiellement a nettoyer`

Fichiers concernes:

- [IntegrationView.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/admin/src/app/ui/IntegrationView.tsx:1)
- [integration.api.ts](C:/Users/gbamb/Desktop/projet/whatsapp/admin/src/app/lib/api/integration.api.ts:1)

## 8. `auto-login` et page `auto_connexion`

### Etat

Le projet contient un mode d'auto-connexion par token derive email/telephone.

### Analyse

Ce n'est pas directement lie au plan double DB, mais c'est une zone fragile et peu compatible avec une architecture metier stricte et securisee.

### Recommendation

- si cette fonctionnalite n'est plus indispensable: la supprimer
- sinon la sortir du scope prioritaire et la requalifier comme risque securite

### Niveau de suppression

`Candidat fort a suppression`

Fichiers concernes:

- [auth.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/auth/auth.controller.ts:1)
- [auto_connexion/page.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/app/auto_connexion/page.tsx:1)

## 9. `IpAccessView`

### Etat

Le fichier est un alias de compatibilite vers `GeoAccessView`.

### Analyse

Ce n'est pas du code mort au sens strict, mais c'est du code de compatibilite temporaire.

### Recommendation

- garder temporairement
- supprimer une fois tous les imports migrés vers `GeoAccessView`

### Niveau de suppression

`Nettoyage ulterieur`

Fichier concerne:

- [IpAccessView.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/admin/src/app/ui/IpAccessView.tsx:1)

## 10. Champs legacy dans `ConversationReport`

### Etat

L'entite contient des champs actuels et des champs legacy:

- `clientInterest`
- `hasOrder`
- `orderAmount`
- `nextActionAt`
- `objections`

### Analyse

Une partie de ces champs semble etre la pour compatibilite historique.

Avec le recentrage sur un rapport metier clair et une copie DB miroir, il faut eviter de continuer a porter des champs ambigus si ils ne sont plus utilises.

### Recommendation

- verifier l'usage reel front/backend
- supprimer les champs non utilises apres audit

### Niveau de suppression

`A auditer puis supprimer si non utilises`

Fichier concerne:

- [conversation-report.entity.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-report/entities/conversation-report.entity.ts:1)

## Configuration et variables a nettoyer

## Variables devenant obsoletes

Si le plan DB-only est confirme, les cles suivantes deviennent obsoletes ou doivent changer de sens:

- `INTEGRATION_ERP_URL`
- `INTEGRATION_SECRET`
- `GICOP_WEBHOOK_VERIFY_TOKEN`
- `ORDER_PLATFORM_REPORT_URL`

### Recommendation

- les deprecier
- les retirer du catalogue de settings admin
- les supprimer apres migration complete

Fichiers concernes:

- [system-config.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/system-config/system-config.service.ts:1)

## Navigation admin a nettoyer

### Sections a reevaluer

- `Intégration ERP`
- `Webhooks sortants`

### Recommendation

- renommer `Intégration ERP` en `Intégration DB` ou `Mappings inter-plateformes`
- retirer `Webhooks sortants` du scope GICOP si non utilise
- mettre a jour les labels et descriptions de settings

Fichiers concernes:

- [admin-data.ts](C:/Users/gbamb/Desktop/projet/whatsapp/admin/src/app/data/admin-data.ts:1)
- [dashboard page.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/admin/src/app/dashboard/commercial/page.tsx:1)

## Nouveau code a creer en remplacement

## 1. Nouvelle couche lecture base commande

Modules a creer:

- `order-db-read`
- `order-db-entities`
- `order-db-mapping`

Services a creer:

- `OrderCommandReadService`
- `OrderStatusReadService`
- `OrderCallLogReadService`
- `OrderProspectReadService`

## 2. Nouvelle couche ecriture DB miroir

Modules a creer:

- `order-db-write`
- `order-sync`

Services a creer:

- `OrderReportMirrorWriteService`
- `OrderClosureMirrorWriteService`
- `OrderCallValidationMirrorWriteService`
- `OrderFollowUpMirrorWriteService`

## 3. Journal de synchro

Creer une table locale type:

- `integration_sync_log`

et un service:

- `IntegrationSyncLogService`

## Plan de suppression et refactor par phase

## Phase A. Introduire la double DB sans casser l'existant

- ajouter la seconde connexion
- ajouter la lecture DB commande
- ajouter les tables miroir
- recabler la soumission du rapport vers DB miroir

Ne rien supprimer encore.

## Phase B. Basculer les flux critiques

- remplacer les lectures webhook/ERP par lectures DB
- remplacer les appels HTTP de rapport par ecriture DB miroir
- basculer les vues admin de supervision

## Phase C. Supprimer l'ancien code

Supprimer:

- `inbound-integration`
- `gicop-webhook`
- dispatch HTTP ERP dans `integration.service`
- listeners ERP associes
- settings webhook ERP devenus inutiles

## Phase D. Nettoyage secondaire

- auditer les champs legacy du rapport
- supprimer `auto-login` si confirme inutile
- supprimer `IpAccessView` alias une fois les imports nettoyes
- reevaluer `outbound-webhook` selon usage reel produit

## Liste de suppression recommandee

## A supprimer apres migration

- `message_whatsapp/src/inbound-integration/*`
- `message_whatsapp/src/gicop-webhook/*`
- dispatch HTTP ERP dans `message_whatsapp/src/integration/integration.service.ts`
- listeners de retransmission ERP dans `message_whatsapp/src/integration/integration.listener.ts`
- references UI/admin aux endpoints webhook GICOP
- config `INTEGRATION_ERP_URL`, `INTEGRATION_SECRET`, `GICOP_WEBHOOK_VERIFY_TOKEN`, `ORDER_PLATFORM_REPORT_URL`

## A refactorer

- `message_whatsapp/src/gicop-report/report-submission.service.ts`
- `message_whatsapp/src/gicop-report/order-platform-sync.service.ts`
- `admin/src/app/ui/IntegrationView.tsx`
- `admin/src/app/ui/GicopSupervisionView.tsx`
- `admin/src/app/data/admin-data.ts`

## A auditer avant suppression

- champs legacy de `ConversationReport`
- `outbound-webhook`
- `auto-login` / `auto_connexion`

## Avis final

Le nouveau plan double DB est bon, mais il impose un nettoyage important du code existant.

Le principal gain sera:

- moins d'integration HTTP
- moins de duplication de logique
- une architecture plus lisible

Le principal risque serait de garder en parallele:

- les webhooks historiques
- les appels HTTP de sync
- et la nouvelle lecture/ecriture DB

Cela creerait un systeme hybride confus.

Donc la bonne strategie est:

1. introduire la double DB
2. migrer les flux critiques
3. supprimer franchement les modules devenus obsoletes
4. nettoyer les vues admin et settings associes
