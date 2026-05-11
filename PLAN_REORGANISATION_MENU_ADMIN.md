# Plan d'implémentation — Réorganisation du menu admin

Date : 2026-05-11  
Source : `docs/PROPOSITION_ORGANISATION_MENU_ADMIN.md`  
Objectif : passer de 14 groupes / 34 entrées à 9 groupes dans la sidebar admin.

---

## Périmètre

| Fichier | Type de modification |
|---|---|
| `admin/src/app/data/admin-data.ts` | Réorganisation complète de `navigationGroups` |
| `admin/src/app/lib/definitions.ts` | Aucun changement nécessaire — les `id` des `ViewMode` ne changent pas |
| `admin/src/app/dashboard/commercial/page.tsx` | Aucun changement nécessaire — le switch sur `ViewMode` est indépendant de l'organisation des groupes |
| `admin/src/app/ui/Navigation.tsx` | Aucun changement nécessaire — le composant est déjà générique |

Seul `admin-data.ts` est à modifier.

---

## Étape 1 — Corriger les libellés et l'encodage (priorité haute)

Plusieurs libellés actuels contiennent des caractères accentués mal encodés ou des termes anglais/techniques.

| `id` | Libellé actuel | Libellé cible |
|---|---|---|
| `queue` | `Queue` | `File d'attente` |
| `crons` | `CRONs` | `Tâches planifiées` |
| `broadcasts` | `Broadcasts` | `Diffusions` |
| `templates` | `Templates HSM` | `Templates WhatsApp` |
| `system-health` | `Santé serveur` *(encodage ok)* | `Sante serveur` → vérifier rendu |
| `observabilite` | `Observabilite` | `Observabilité` *(corriger accent)* |
| `integration` | `Intégration ERP` *(encodage ok)* | `Integration ERP` → vérifier rendu |
| `ip-access` | `Restriction géo.` | `Restrictions d'acces` |
| `capacity` | `Capacité conv.` | `Capacite conversations` |
| `relance-config` | `Config relances auto` | `Configuration relances` |
| `sessions` | `Heures travail` | `Heures de travail` |
| `roles` | `Rôles & Permissions` | `Roles & permissions` |
| `sla-rules` | `Règles SLA` | `Regles SLA` |
| `alert-config` | `Alertes système` | `Alertes systeme` |
| `audit-logs` | `Journal d'audit` | `Journal d'audit` *(vérifier apostrophe)* |
| `outbox-sync` | `Sync DB2 (Outbox)` | `Sync DB2` |
| `ia-governance` | badge `'NEW'` → supprimer | `badge: null` |
| `analytics` | badge `'NEW'` → supprimer | `badge: null` |
| `contexts` | badge `'NEW'` → supprimer | `badge: null` |

---

## Étape 2 — Réorganiser les 14 groupes en 9 groupes

### Mapping de déplacement des entrées

| `id` | Groupe actuel | Groupe cible |
|---|---|---|
| `overview` | Tableau de bord | **1. Tableau de bord** |
| `conversations` | Conversations | **2. Conversations & Dispatch** |
| `messages` | Conversations | **2. Conversations & Dispatch** |
| `queue` | Dispatch & Queue | **2. Conversations & Dispatch** |
| `dispatch` | Dispatch & Queue | **2. Conversations & Dispatch** |
| `capacity` | Accès & Sécurité | **2. Conversations & Dispatch** |
| `contexts` | Infrastructure | **2. Conversations & Dispatch** |
| `flowbot` | Conversations | **5. Automatisation & Diffusion** |
| `commerciaux` | Equipe & Postes | **3. Equipe & Planning** |
| `postes` | Equipe & Postes | **3. Equipe & Planning** |
| `commercial-groups` | Planning | **3. Equipe & Planning** |
| `work-schedule` | Planning | **3. Equipe & Planning** |
| `presence` | Planning | **3. Equipe & Planning** |
| `sessions` | Accès & Sécurité | **3. Equipe & Planning** |
| `performance` | Equipe & Postes | **6. Analyse & Performance** |
| `ranking` | Equipe & Postes | **6. Analyse & Performance** |
| `clients` | Analytics | **4. CRM & Relances** |
| `crm` | CRM & Contacts | **4. CRM & Relances** |
| `follow-ups` | CRM & Contacts | **4. CRM & Relances** |
| `relance-config` | CRM & Contacts | **4. CRM & Relances** |
| `targets` | CRM & Contacts | **4. CRM & Relances** |
| `broadcasts` | Diffusion | **5. Automatisation & Diffusion** |
| `templates` | Diffusion | **5. Automatisation & Diffusion** |
| `crons` | Dispatch & Queue | **5. Automatisation & Diffusion** |
| `analytics` | Analytics | **6. Analyse & Performance** |
| `rapports` | Analytics | **6. Analyse & Performance** |
| `system-health` | Infrastructure | **7. Supervision & Alertes** |
| `observabilite` | Infrastructure | **7. Supervision & Alertes** |
| `notifications` | Notifications | **7. Supervision & Alertes** |
| `alert-config` | Notifications | **7. Supervision & Alertes** |
| `go_no_go` | Infrastructure | **7. Supervision & Alertes** |
| `roles` | Gouvernance | **8. Administration & Securite** |
| `ip-access` | Accès & Sécurité | **8. Administration & Securite** |
| `login-logs` | Accès & Sécurité | **8. Administration & Securite** |
| `audit-logs` | Gouvernance | **8. Administration & Securite** |
| `sla-rules` | Gouvernance | **8. Administration & Securite** |
| `ia-governance` | Intelligence Artificielle | **8. Administration & Securite** |
| `settings` | pied de sidebar (hors menu) | **8. Administration & Securite** |
| `canaux` | Infrastructure | **9. Integrations & GICOP** |
| `integration` | Infrastructure | **9. Integrations & GICOP** |
| `outbound-webhooks` | Gouvernance | **9. Integrations & GICOP** |
| `gicop-supervision` | GICOP | **9. Integrations & GICOP** |
| `outbox-sync` | GICOP | **9. Integrations & GICOP** |
| `complaints` | GICOP | **9. Integrations & GICOP** |

> **Note `settings`** : l'entrée `settings` n'existe pas encore dans `navigationGroups` (elle est gérée séparément dans le pied de sidebar). Elle doit être ajoutée avec `{ id: 'settings', name: 'Parametres', icon: Settings, badge: null }` dans le groupe Administration & Securite. Vérifier que le case `'settings'` existe déjà dans le switch de `page.tsx` avant de l'ajouter.

---

## Étape 3 — Code cible pour `admin-data.ts`

Remplacer intégralement le tableau `navigationGroups` par :

```ts
export const navigationGroups: NavigationGroup[] = [
  {
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    items: [
      { id: 'overview', name: "Vue d'ensemble", icon: Home, badge: null },
    ],
  },
  {
    label: 'Conversations & Dispatch',
    icon: MessageSquare,
    items: [
      { id: 'conversations', name: 'Conversations', icon: MessageSquare, badge: null },
      { id: 'messages', name: 'Messages', icon: MessageCircle, badge: null },
      { id: 'queue', name: "File d'attente", icon: ListOrdered, badge: null },
      { id: 'dispatch', name: 'Dispatch', icon: Route, badge: null },
      { id: 'capacity', name: 'Capacite conversations', icon: Gauge, badge: null },
      { id: 'contexts', name: 'Contextes', icon: Layers, badge: null },
    ],
  },
  {
    label: 'Equipe & Planning',
    icon: Users,
    items: [
      { id: 'commerciaux', name: 'Commerciaux', icon: Users, badge: null },
      { id: 'commercial-groups', name: 'Groupes commerciaux', icon: Users2, badge: null },
      { id: 'postes', name: 'Postes', icon: Network, badge: null },
      { id: 'work-schedule', name: 'Plannings de travail', icon: CalendarDays, badge: null },
      { id: 'presence', name: 'Presence du jour', icon: UserCheck, badge: null },
      { id: 'sessions', name: 'Heures de travail', icon: Clock, badge: null },
    ],
  },
  {
    label: 'CRM & Relances',
    icon: Briefcase,
    items: [
      { id: 'clients', name: 'Clients', icon: Briefcase, badge: null },
      { id: 'crm', name: 'Champs CRM', icon: Database, badge: null },
      { id: 'follow-ups', name: 'Relances', icon: PhoneCall, badge: null },
      { id: 'relance-config', name: 'Configuration relances', icon: Settings, badge: null },
      { id: 'targets', name: 'Objectifs', icon: Target, badge: null },
    ],
  },
  {
    label: 'Automatisation & Diffusion',
    icon: Bot,
    items: [
      { id: 'flowbot', name: 'Automatisations', icon: Bot, badge: null },
      { id: 'broadcasts', name: 'Diffusions', icon: Send, badge: null },
      { id: 'templates', name: 'Templates WhatsApp', icon: FileCode2, badge: null },
      { id: 'crons', name: 'Taches planifiees', icon: Timer, badge: null },
    ],
  },
  {
    label: 'Analyse & Performance',
    icon: BarChart3,
    items: [
      { id: 'analytics', name: 'Analytics', icon: BarChart3, badge: null },
      { id: 'performance', name: 'Performance', icon: TrendingUp, badge: null },
      { id: 'ranking', name: 'Classement', icon: Trophy, badge: null },
      { id: 'rapports', name: 'Rapports', icon: FileText, badge: null },
    ],
  },
  {
    label: 'Supervision & Alertes',
    icon: Activity,
    items: [
      { id: 'system-health', name: 'Sante serveur', icon: Server, badge: null },
      { id: 'observabilite', name: 'Observabilite', icon: Activity, badge: 'SLO' },
      { id: 'notifications', name: 'Notifications', icon: Bell, badge: null },
      { id: 'alert-config', name: 'Alertes systeme', icon: Bell, badge: null },
      { id: 'go_no_go', name: 'GO/NO-GO', icon: ShieldCheck, badge: 'OPS' },
    ],
  },
  {
    label: 'Administration & Securite',
    icon: Shield,
    items: [
      { id: 'roles', name: 'Roles & permissions', icon: ShieldCheck, badge: null },
      { id: 'ip-access', name: "Restrictions d'acces", icon: Lock, badge: null },
      { id: 'login-logs', name: 'Journal connexions', icon: LogIn, badge: null },
      { id: 'audit-logs', name: "Journal d'audit", icon: ClipboardList, badge: null },
      { id: 'sla-rules', name: 'Regles SLA', icon: Shield, badge: null },
      { id: 'ia-governance', name: 'Gouvernance IA', icon: Sparkles, badge: null },
      { id: 'settings', name: 'Parametres', icon: Settings, badge: null },
    ],
  },
  {
    label: 'Integrations & GICOP',
    icon: Link2,
    items: [
      { id: 'canaux', name: 'Canaux', icon: Globe, badge: null },
      { id: 'integration', name: 'Integration ERP', icon: Link2, badge: null },
      { id: 'outbound-webhooks', name: 'Webhooks sortants', icon: Webhook, badge: null },
      { id: 'gicop-supervision', name: 'Supervision GICOP', icon: Stethoscope, badge: 'P0' },
      { id: 'outbox-sync', name: 'Sync DB2', icon: Database, badge: null },
      { id: 'complaints', name: 'Plaintes clients', icon: AlertCircle, badge: null },
    ],
  },
];
```

---

## Étape 4 — Vérifier `page.tsx` pour `settings`

Avant d'ajouter `settings` dans le menu, confirmer que `page.tsx` gère le cas :

```ts
// admin/src/app/dashboard/commercial/page.tsx
case 'settings':
  return <SettingsView />;
```

Si le case est absent, ajouter le composant `SettingsView` (vue vide ou existante) avant de rendre l'entrée visible dans la sidebar.

---

## Étape 5 (optionnelle) — Fusions en onglets

Cette étape est **indépendante** de la réorganisation des groupes. Elle demande une modification du pattern de rendu dans `page.tsx` (une entrée sidebar → composant avec tabs internes).

Ordre de priorité des fusions recommandées :

| Priorité | Entrée sidebar | Onglets internes | IDs fusionnés |
|---|---|---|---|
| 1 | `Planning` | Plannings / Présence / Heures | `work-schedule`, `presence`, `sessions` |
| 2 | `Dispatch` | File d'attente / Règles / Capacité / Contextes | `queue`, `dispatch`, `capacity`, `contexts` |
| 3 | `Supervision` | Santé / Observabilité / Notifs / Alertes / GO-NO-GO | `system-health`, `observabilite`, `notifications`, `alert-config`, `go_no_go` |
| 4 | `Clients & CRM` | Clients / Champs CRM | `clients`, `crm` |
| 5 | `Relances` | Relances / Configuration | `follow-ups`, `relance-config` |
| 6 | `Diffusions` | Campagnes / Templates | `broadcasts`, `templates` |
| 7 | `Securite & Acces` | Rôles / Restrictions / Connexions | `roles`, `ip-access`, `login-logs` |

**Pattern d'implémentation pour chaque fusion :**

1. Créer un composant wrapper (ex. `PlanningTabsView.tsx`) avec un état `activeTab`.
2. Modifier le case dans `page.tsx` : `case 'planning': return <PlanningTabsView />;`
3. Remplacer les 3 entrées sidebar par une seule dans `admin-data.ts`.
4. Les anciens `ViewMode` (`work-schedule`, `presence`, `sessions`) peuvent être retirés de `definitions.ts` ou conservés comme identifiants d'onglets internes.

---

## Checklist de validation

Après application de l'étape 2-3 :

- [ ] Tous les `id` existants sont encore présents dans `navigationGroups` (aucune perte)
- [ ] `settings` a un case correspondant dans `page.tsx`
- [ ] Aucun badge `'NEW'` résiduel sur des modules stabilisés
- [ ] La sidebar s'affiche sans erreur de compilation TypeScript
- [ ] Chaque entrée de menu ouvre la bonne vue (vérification manuelle des 9 groupes)
- [ ] Le groupe `Tableau de bord` reste ouvert par défaut au chargement
- [ ] Les entrées déplacées (`capacity`, `contexts`, `sessions`, `performance`, `ranking`, `clients`, `outbound-webhooks`) s'affichent dans leur nouveau groupe

---

## Récapitulatif des suppressions de groupes

| Groupe supprimé | Entrées redistribuées vers |
|---|---|
| `Equipe & Postes` | Equipe & Planning (commerciaux, postes) + Analyse & Performance (performance, ranking) |
| `Conversations` | Conversations & Dispatch (conversations, messages) + Automatisation & Diffusion (flowbot) |
| `Dispatch & Queue` | Conversations & Dispatch (queue, dispatch) + Automatisation & Diffusion (crons) |
| `Infrastructure` | Conversations & Dispatch (contexts) + Supervision & Alertes (system-health, observabilite, go_no_go) + Integrations & GICOP (canaux, integration) |
| `Analytics` | CRM & Relances (clients) + Analyse & Performance (analytics, rapports) |
| `Notifications` | Supervision & Alertes |
| `CRM & Contacts` | CRM & Relances |
| `Accès & Sécurité` | Equipe & Planning (sessions) + Conversations & Dispatch (capacity) + Administration & Securite (ip-access, login-logs) |
| `Diffusion` | Automatisation & Diffusion |
| `Gouvernance` | Administration & Securite (sla-rules, roles, audit-logs) + Integrations & GICOP (outbound-webhooks) |
| `Intelligence Artificielle` | Administration & Securite (ia-governance) |
| `Planning` | Equipe & Planning |
| `GICOP` | Integrations & GICOP |
