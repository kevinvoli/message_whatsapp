# Analyse de l'Application — Domaine, Positionnement et Exigences

> **Date** : 2026-03-25
> **Périmètre analysé** : `message_whatsapp/` (backend) + `front/` (agents) + `admin/` (supervision)

---

## 1. Ce qu'est l'application

C'est une **plateforme de gestion de la relation client (CRM) par messagerie instantanée**,
spécialisée dans WhatsApp Business. Le domaine exact est le **CCaaS — Contact Center as a Service**,
segment "messagerie textuelle multi-agents".

En termes concrets : une entreprise connecte ses numéros WhatsApp (et autres canaux) à la plateforme,
puis plusieurs agents commerciaux répondent aux clients depuis une interface centralisée,
pendant qu'un admin supervise et configure tout.

### Les 3 composants

| Composant | Technologie | Rôle |
|-----------|------------|------|
| `message_whatsapp/` | NestJS + TypeORM + MySQL | Cerveau : routing, dispatch, webhooks, automatisation |
| `front/` | Next.js + WebSocket | Interface agents : chat en temps réel |
| `admin/` | Next.js | Panel de supervision : analytics, configuration, gestion |

---

## 2. Positionnement dans le domaine

Le CCaaS par messagerie WhatsApp se mesure aux concurrents comme
**Trengo, Chatwoot, Freshdesk Messaging, HubSpot Conversations, Zendesk**.
Ces plateformes définissent les exigences de base du secteur.

**Différenciateur fort de cette application** : le support multi-providers natif
(Whapi, Meta Cloud API, Messenger, Instagram, Telegram) dans une même interface unifiée —
la plupart des concurrents sont mono-canal ou facturent chaque canal séparément.

---

## 3. Ce que l'application réussit bien ✅

| Fonctionnalité | Niveau |
|---|---|
| Réception et envoi de messages texte, images, vidéos, docs, audio | Solide |
| Temps réel via WebSocket (conversations live) | Solide |
| Multi-providers (Whapi, Meta, Messenger, Instagram, Telegram) | Avancé — différenciateur fort |
| Dispatch automatique des conversations vers les agents | Présent |
| Messages automatiques (MessageAuto / templates HSM) | Présent |
| Gestion des contacts avec historique et logs d'appels | Présent |
| Dashboard admin avec métriques (perf agents, volumes, webhooks) | Présent |
| Indicateur de frappe en temps réel (typing indicator) | Présent |
| Réponse à un message ciblé (reply with quote) | Présent |
| Enregistrement vocal directement depuis l'interface | Présent — avancé |
| CronJobs configurables depuis l'admin | Avancé |
| Architecture webhook avec idempotence, rate limiting, circuit breaker | Très solide — niveau production |
| Sécurité HMAC sur les webhooks | Présent |
| Filtres de conversations (statut, priorité, non lus) | Présent |
| Gestion multi-postes / multi-agents | Présent |

---

## 4. Ce qui manque par rapport aux exigences de base du domaine ❌

### 4.1 Réponses prédéfinies (canned responses) — PRIORITÉ HAUTE

Dans tout CRM messaging, les agents ont accès à une bibliothèque de réponses types
(FAQ, formules de politesse, procédures). Ici l'agent doit tout taper manuellement.

**Impact** : Perte de temps importante, incohérence entre agents, erreurs de saisie.
**Ce que font les concurrents** : bibliothèque de modèles accessibles via `/` ou un raccourci clavier.

---

### 4.2 Transfert de conversation entre agents — PRIORITÉ HAUTE

Un agent ne peut pas passer une conversation à un collègue depuis l'interface.
Fonctionnalité de base dans tout helpdesk.

**Impact** : Si un agent est absent ou ne sait pas répondre, la conversation est bloquée
ou abandonnée. Aucune continuité de service.

---

### 4.3 Notes internes par conversation — PRIORITÉ HAUTE

Les agents ne peuvent pas laisser une note privée visible uniquement en interne
(ex: "Client difficile", "Attente retour fournisseur", "A appelé hier").

**Impact** : Perte de contexte entre agents, impossible de faire un suivi qualitatif
des dossiers complexes.

---

### 4.4 Indicateurs de lecture visuels — PRIORITÉ MOYENNE

Les statuts `sent` / `delivered` / `read` sont bien stockés en base (le backend gère
correctement les webhooks de statut), mais l'interface n'affiche pas les coches
(✓ / ✓✓ gris / ✓✓ bleu).

**Impact** : L'agent ne sait pas si son message a été lu — information pourtant affichée
dans WhatsApp natif et dans tous les outils concurrents.

---

### 4.5 Erreurs de livraison non lisibles pour l'agent — PRIORITÉ HAUTE

Quand un message échoue (`status: failed`), le code d'erreur Meta est stocké en base
mais l'agent voit uniquement "Échec" sans explication.

**Exemples de messages manquants** :

| Code Meta | Ce que l'agent devrait voir |
|-----------|----------------------------|
| `131047` | "Fenêtre 24h expirée — utilisez un template" |
| `131026` | "Ce numéro n'est pas sur WhatsApp" |
| `131048` | "Message signalé comme spam par le destinataire" |
| `130429` | "Limite de débit atteinte — réessayez dans quelques minutes" |

**Impact** : L'agent ne comprend pas pourquoi son message n'est pas parti et ne peut
pas prendre la bonne décision (changer de canal, utiliser un template, rappeler).

---

### 4.6 Alertes SLA / temps de réponse — PRIORITÉ MOYENNE

Le temps de réponse moyen est calculé (visible dans `ChatInput`) mais de façon passive.
Aucun système n'alerte si une conversation dépasse X minutes sans réponse.

**Impact** : Les conversations urgentes peuvent rester sans réponse sans que personne
ne soit averti. Dans un centre de contact, le SLA (ex: répondre en moins de 5 min) est
une exigence opérationnelle fondamentale.

---

### 4.7 Tags / Labels sur les conversations — PRIORITÉ MOYENNE

Impossible de catégoriser une conversation ("Réclamation", "Devis", "SAV", "Urgent personnalisé").
Les filtres existants (`nouveau`, `urgent`, `non lu`) sont statiques et prédéfinis.

**Impact** : Impossible de segmenter les conversations par type de demande, impossible
de faire des statistiques par catégorie, impossible de router vers un agent spécialisé
selon le sujet.

---

### 4.8 Monitoring de la santé du compte Meta — PRIORITÉ CRITIQUE

Si Meta désactive ou restreint le compte WhatsApp Business, l'application ne le sait pas
et continue d'essayer d'envoyer des messages en silence, avec des erreurs cryptiques.

**Événements non surveillés** : `account_update`, `business_status_update`, `account_alerts`,
`phone_number_quality_update`, `message_template_status_update`.

**Impact** : Panne totale silencieuse. L'équipe peut mettre des heures à comprendre
pourquoi les messages n'arrivent plus. Risque opérationnel réel en production.

*(Détail complet dans `META_WEBHOOK_EVENTS_BILAN.md`)*

---

### 4.9 Satisfaction client (CSAT) — PRIORITÉ BASSE

Aucun système de notation de conversation après clôture.

**Impact** : Impossible de mesurer objectivement la qualité du service rendu.
Les métriques admin actuelles (volume, temps de réponse) mesurent la quantité,
pas la qualité perçue par le client.

---

### 4.10 Titre de page non mis à jour — PRIORITÉ BASSE

```typescript
// front/src/app/layout.tsx — ligne 19
export const metadata: Metadata = {
  title: "Create Next App",        // ← jamais personnalisé
  description: "Generated by create next app",
};
```

Détail cosmétique mais révélateur du niveau de finition de l'interface commerciale.

---

## 5. Verdict global

```
Domaine     : CCaaS / CRM Messagerie WhatsApp multi-providers
```

| Dimension | Score | Commentaire |
|-----------|-------|-------------|
| Maturité technique backend | 9/10 | Architecture production-grade, solide |
| Maturité fonctionnelle | 6/10 | MVP solide, manques importants |
| Maturité UI/UX | 5/10 | Fonctionnel mais inachevé |

**Le backend est clairement le point fort** — l'architecture est robuste, multi-provider,
avec une vraie réflexion sur la fiabilité (idempotence, circuit breaker, rate limiting,
unified ingress adapter pattern).

**L'interface commerciale est le point faible** — elle couvre les besoins minimaux mais
manque des fonctionnalités que tout agent de centre de contact attend au quotidien.

---

## 6. Priorités d'amélioration recommandées

### 🔴 Immédiat — Bloquant en production

1. **Monitoring santé compte Meta** (`account_update`, `phone_number_quality_update`)
   → Alertes admin si compte désactivé ou restreint
2. **Erreurs de livraison lisibles** → Mapper les codes Meta en messages humains dans le frontend

### 🟠 Court terme — Impact quotidien sur les agents

3. **Réponses prédéfinies** → Bibliothèque de modèles accessibles depuis `ChatInput`
4. **Notes internes** → Commentaires privés par conversation
5. **Transfert de conversation** → Passer un dossier à un autre agent

### 🟡 Moyen terme — Qualité de service

6. **Indicateurs de lecture visuels** (✓ / ✓✓ gris / ✓✓ bleu)
7. **Tags / Labels personnalisables** sur les conversations
8. **Alertes SLA** — notification si conversation sans réponse depuis X minutes
9. **Origine publicitaire** (`referral`) — afficher la source pub dans la conversation

### 🟢 Long terme — Différenciation

10. **CSAT** — Notation de satisfaction après clôture
11. **WhatsApp Flows** — Formulaires natifs pour qualification et prise de RDV
12. **Chatbot / première réponse automatique** avec handover vers agent humain

---

*Analyse basée sur la lecture du code source complet — `front/`, `admin/`, `message_whatsapp/`.*
*Comparaison avec les standards du secteur CCaaS (Trengo, Chatwoot, Freshdesk, Zendesk).*
