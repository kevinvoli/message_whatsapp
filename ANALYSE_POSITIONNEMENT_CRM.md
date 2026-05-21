# Analyse positionnement — Application vs CRM du marché

**Date :** 2026-05-21

---

## Catégorie de l'application

**Plateforme de messagerie client omnicanale B2C** (Customer Messaging Platform), avec une spécialisation **WhatsApp Business**. Plus précisément, un **shared inbox multi-agents** couplé à un CRM léger, orienté équipes commerciales/support qui gèrent des volumes élevés de conversations clients.

---

## Positionnement dans la hiérarchie du marché

```
┌─────────────────────────────────────────────────────────┐
│  CRM COMPLET                                            │
│  Salesforce · HubSpot · Microsoft Dynamics              │
│  Pipeline, contacts, deals, marketing, reporting full   │
├─────────────────────────────────────────────────────────┤
│  CUSTOMER SUPPORT PLATFORM                              │
│  Zendesk · Freshdesk · Intercom                         │
│  Ticketing, KB, SLA multi-canal, analytics avancées     │
├─────────────────────────────────────────────────────────┤
│  ★ CETTE APPLICATION ★                                  │
│  Messaging Platform / Shared Inbox spécialisé           │
│  WhatsApp-first, intégration ERP native, agents dédiés  │
├─────────────────────────────────────────────────────────┤
│  CPaaS / API PURE                                       │
│  Twilio · Bird · Vonage                                 │
│  Briques bas niveau, pas d'UI métier                    │
└─────────────────────────────────────────────────────────┘
```

---

## Concurrents directs

| Produit | Positionnement | Différence clé |
|---|---|---|
| **WATI** | WhatsApp Team Inbox SaaS | Le plus proche — shared inbox + automation + broadcasts, mais SaaS pur (pas intégrable à un ERP) |
| **Respond.io** | Omnicanal (WA, IG, Messenger, Telegram) | Très complet, forte automation, mais généraliste |
| **Trengo** | Shared inbox omnicanal | Fort sur l'équipe, intégrations CRM tierces |
| **Chatwoot** | Open-source shared inbox | Même modèle, auto-hébergeable, mais moins spécialisé WhatsApp |
| **360dialog** | WhatsApp BSP + hub | Souvent couplé à d'autres outils |
| **Bird (ex-MessageBird)** | API + inbox omnicanal | Plus orienté dev/API |
| **Charles** | WhatsApp commerce | Très orienté vente et catalogue produit |

---

## Avantage différenciant actuel

Ce que ni Salesforce ni Zendesk ne peuvent faire facilement :
- Lier une conversation WhatsApp directement à une commande ERP
- Calculer des obligations d'appels par catégorie client
- Piloter une fenêtre glissante de validation commerciale
- Intégration native DB2 (GICOP) sans connecteurs tiers

C'est la valeur de la **couche métier sur mesure** au-dessus des fondations messaging. L'application est une **vertical SaaS** dans la catégorie messaging — généraliste en dessous (shared inbox WhatsApp), spécialisée en dessus (intégration ERP/GICOP).

---

## Ce qui manque pour rivaliser avec un CRM pur

### 1. Fiche contact unifiée *(priorité haute)*

L'app a `contact_field_definition` / `contact_field_value`, mais ce n'est que du stockage de champs. Un vrai CRM offre :
- Timeline 360° — tous les canaux, appels, emails, achats sur une seule fiche
- Scoring automatique (lead score, engagement score)
- Statut lifecycle (lead → prospect → client → churned)
- Déduplication et merge de contacts

### 2. Pipeline commercial *(le gap le plus bloquant)*

Rien de tel n'existe aujourd'hui. Un CRM a :
- Des **deals/opportunités** avec stages configurables (Prospect → Qualifié → Proposition → Gagné/Perdu)
- Une valeur financière par deal, une probabilité de closing
- Une vue Kanban du pipeline
- Des prévisions de CA (forecast)

> Sans pipeline commercial, l'app reste dans la catégorie "outil de messagerie". Avec un pipeline, les conversations deviennent des étapes d'un cycle de vente traçable.

### 3. Reporting & analytics métier *(priorité haute)*

L'app a des métriques webhook et un audit trail, mais pas :
- Dashboards configurables (taux de conversion, CA généré, performance par agent)
- Analyse d'entonnoir (funnel)
- Rapports sur les deals gagnés/perdus
- Exports vers BI (Tableau, Power BI, Looker)

### 4. Segmentation dynamique *(priorité moyenne)*

Les labels et catégories existent, mais pas :
- Segments dynamiques basés sur des critères combinés (ex : "clients actifs depuis 30 jours avec > 3 commandes et tag VIP")
- Listes actives qui se mettent à jour automatiquement
- Ciblage pour les broadcasts basé sur ces segments

### 5. Automatisation des processus métier *(priorité moyenne)*

Le FlowBot gère les flows de messagerie, mais un CRM a :
- Workflows déclenchés sur des événements métier (deal passé en stage X → assigner un commercial + envoyer un email)
- Séquences multi-étapes (drip campaigns sur plusieurs semaines)
- Automatisation cross-canal (WA + email + tâche interne)

### 6. Gestion des comptes / B2B *(priorité selon usage)*

Manque total pour un usage B2B :
- Entité `Company/Account` avec hiérarchie (groupe → entreprise → contact)
- Plusieurs contacts rattachés à un même compte
- Vue CA et historique par compte

### 7. Écosystème d'intégrations *(priorité moyenne)*

Un CRM vit par ses connecteurs :
- Email natif (Gmail, Outlook) avec tracking d'ouvertures
- Calendrier (Google Calendar, Outlook) pour les rendez-vous
- Connecteurs standard vers les ERP du marché (pas juste GICOP)
- Zapier / Make pour les intégrations no-code

---

## Synthèse des gaps

```
Ce que l'app fait bien         Ce qu'il faudrait ajouter
──────────────────────         ──────────────────────────
Conversations temps réel   →   Fiche contact 360°
Assignation agents         →   Pipeline deals + forecast
Labels basiques            →   Segmentation dynamique
FlowBot messaging          →   Automation processus métier
Intégration GICOP          →   Connecteurs standard (email, CRM tiers)
Métriques canal            →   Reporting CA / conversion
```

---

## Ordre de priorité pour monter en gamme

| Priorité | Fonctionnalité | Impact |
|---|---|---|
| P0 | Pipeline commercial (deals + stages) | Change de catégorie produit |
| P0 | Fiche contact 360° avec lifecycle | Fondation CRM |
| P1 | Reporting & dashboards métier | Rétention et upsell |
| P1 | Segmentation dynamique | Valeur marketing |
| P2 | Automatisation processus métier | Productivité |
| P2 | Intégrations email natif | Adoption |
| P3 | Gestion comptes B2B | Nouveau segment |
