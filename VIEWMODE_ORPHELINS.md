# ViewMode — Valeurs orphelines

> Audit du 2026-06-30. Ces 24 valeurs existent dans le type `ViewMode` (`admin/src/app/lib/types/ui.ts`) mais n'ont ni case dans `renderContent()`, ni entrée dans `admin-data.ts` (navigation sidebar). Elles affichent une page blanche si elles sont activées.
>
> **Décision : ne pas supprimer** — garder pour conserver la cohérence avec les fonctionnalités planifiées.

---

## Légende statut backend

| Statut | Signification |
|--------|---------------|
| ✅ Backend complet | Module NestJS + controller + endpoints dédiés |
| ⚠️ Backend partiel | Logique existante mais pas de endpoint dédié ou module incomplet |
| ❌ Absent | Aucune trace dans le backend |

---

## Valeurs avec backend implémenté → admin à créer

Ces vues ont leur backend prêt. Il manque uniquement le composant admin.

| ViewMode | Statut backend | Module backend | Endpoints |
|----------|---------------|----------------|-----------|
| `break-supervision` | ✅ Backend complet | `src/commercial-group/` | `GET /commercial-groups/break-supervision` |
| `presence` | ✅ Backend complet | `src/commercial-group/` | `GET /commercial-groups/presence` + `GET /commercial-groups/presence-history` |
| `appels` | ✅ Backend complet | `src/call-log/` | `GET /contact/:id/call-logs` · `GET /call-logs/commercial/:id` |
| `sessions` | ✅ Backend complet | `src/chat-session/` | Module complet (ChatSession entity, service) |
| `login-logs` | ✅ Backend complet | `src/connection-log/` | Module complet (connexions, déconnexions) |

---

## Valeurs avec backend partiel → nécessite analyse avant implémentation

| ViewMode | Statut backend | Détail |
|----------|---------------|--------|
| `capacity` | ⚠️ Backend partiel | Logique de capacité présente dans `webhook-rate-limit.service.ts` mais pas de module `capacity/` dédié ni d'endpoint admin |
| `missed-calls` | ⚠️ Backend partiel | `src/call-log/` gère les logs d'appels mais pas de requête dédiée "appels manqués" — à construire sur `call-log` |

---

## Valeurs sans backend → fonctionnalités entièrement à créer

Ces vues n'ont aucune trace dans le backend. Elles nécessitent backend + frontend.

| ViewMode | Domaine probable |
|----------|-----------------|
| `flowbot` | Automatisation FlowBot (flows, scénarios) |
| `contexts` | Contextes de conversation (CRM enrichi) |
| `follow-ups` | Relances planifiées (follow-up reminders) |
| `portfolio` | Vue portefeuille commercial (clients assignés) |
| `targets` | Objectifs / KPIs commerciaux |
| `ip-access` | Restriction d'accès par IP |
| `system-health` | Supervision santé système (différent de GoNoGo) |
| `integration` | Intégrations tierces (ERP, CRM externe) |
| `ranking` | Classement des commerciaux |
| `ia-governance` | Gouvernance IA (paramétrage IA, audit) |
| `gicop-supervision` | Supervision GICOP (admin côté obligations) |
| `outbox-sync` | Synchronisation boîte d'envoi |
| `work-schedule` | Horaires de travail commerciaux |
| `complaints` | Gestion des réclamations clients |
| `relance-config` | Configuration des relances automatiques |
| `call-devices` | Gestion des postes téléphoniques / VOIP |
| `applications` | Applications de messagerie (`MessagingApplication`) — backend planifié dans CLAUDE.md mais module absent |

---

## Recommandation

### Priorité haute (backend prêt)
Implémenter en admin dans cet ordre :
1. **`break-supervision`** — vue supervision des pauses par commercial (endpoint prêt)
2. **`presence`** — tableau de présence historique des commerciaux (endpoint prêt)
3. **`appels`** — historique des appels par commercial/contact (endpoint prêt)
4. **`sessions`** — supervision des sessions de chat (module complet)
5. **`login-logs`** — historique connexions/déconnexions (module complet)

### Priorité basse (backend absent)
Ne pas ajouter au backlog sans décision produit. Garder les valeurs dans `ViewMode` comme marqueurs des fonctionnalités planifiées.

---

## Comment implémenter une vue orpheline

1. Créer `admin/src/app/ui/NomDeLaVueView.tsx` avec les conventions du projet (`<Tabs>`, `<Modal>`, `useAsync`, variables CSS)
2. Ajouter le case dans `renderContent()` de `admin/src/app/dashboard/commercial/page.tsx`
3. Ajouter l'entrée dans `admin/src/app/data/admin-data.ts` (navigation)
4. Vérifier `npx tsc --noEmit` — 0 erreur
