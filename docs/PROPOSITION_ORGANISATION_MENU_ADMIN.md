# Proposition d'organisation du menu admin

Date d'analyse : 2026-05-11

## Source analysee

Le menu du panel admin est defini dans `admin/src/app/data/admin-data.ts`, via `navigationGroups`.
Il est affiche par `admin/src/app/ui/Navigation.tsx` et les vues sont rendues dans `admin/src/app/dashboard/commercial/page.tsx`.

Le menu actuel contient 14 groupes pour 34 entrees visibles, plus `Parametres` place a part dans le pied de sidebar.

## Diagnostic du menu actuel

### Points positifs

- La navigation est deja centralisee dans une structure de groupes.
- Chaque entree correspond a un `ViewMode` clair cote dashboard.
- Le composant supporte deja les groupes repliables, ce qui permet une reorganisation sans refonte lourde.

### Problemes observes

- Trop de groupes de premier niveau : 14 groupes creent une sidebar longue et difficile a scanner.
- Certains groupes se chevauchent fonctionnellement :
  - `Equipe & Postes` et `Planning` concernent tous les deux les ressources humaines operationnelles.
  - `Infrastructure`, `Dispatch & Queue`, `Gouvernance`, `Notifications` et `Acces & Securite` contiennent tous des fonctions d'exploitation ou d'administration technique.
  - `Analytics` contient `Clients`, alors que les clients appartiennent plutot au CRM.
- Certaines entrees sont mal positionnees :
  - `Alertes systeme` est dans `Notifications`, mais son usage est proche de la supervision et de la sante systeme.
  - `Webhooks sortants` est dans `Gouvernance`, alors que c'est une integration technique.
  - `Sessions` est libelle `Heures travail`, mais le planning existe deja dans un autre groupe.
  - `Capacity conv.` est dans `Acces & Securite`, alors que c'est une regle d'exploitation/dispatch.
  - `Contextes` est dans `Infrastructure`, mais sa logique est proche du routage, des canaux et des postes.
- La nomenclature melange francais, anglais et termes techniques : `Broadcasts`, `Templates HSM`, `Queue`, `CRONs`, `GO/NO-GO`, `Sync DB2`.
- La separation entre metier, operations, configuration et supervision n'est pas assez nette.

## Principe de restructuration propose

La sidebar devrait suivre le parcours naturel d'un administrateur :

1. Voir l'etat global.
2. Piloter les conversations et le dispatch.
3. Gerer les equipes, postes et plannings.
4. Gerer les clients, relances et objectifs.
5. Configurer les canaux, automatisations et diffusions.
6. Suivre les performances et rapports.
7. Superviser la plateforme.
8. Administrer la securite, la gouvernance et les integrations.
9. Isoler les modules metier specifiques comme GICOP.

Objectif : passer de 14 groupes a 9 groupes maximum, avec des groupes plus stables et plus previsibles.

## Structure cible recommandee

### 1. Tableau de bord

Role : entree principale et etat global.

- `overview` - Vue d'ensemble

### 2. Conversations & Dispatch

Role : tout ce qui concerne le traitement des conversations en temps reel, l'assignation et les files.

- `conversations` - Conversations
- `messages` - Messages
- `queue` - File d'attente
- `dispatch` - Dispatch
- `capacity` - Capacite conversations
- `contexts` - Contextes

Raison : ces vues forment le flux operationnel principal. `capacity` et `contexts` influencent directement l'assignation et la distribution.

### 3. Equipe & Planning

Role : gestion des ressources humaines operationnelles.

- `commerciaux` - Commerciaux
- `commercial-groups` - Groupes commerciaux
- `postes` - Postes
- `work-schedule` - Plannings de travail
- `presence` - Presence du jour
- `sessions` - Heures de travail

Raison : les commerciaux, groupes, postes, presence et horaires doivent etre rapproches. Cela reduit la dispersion actuelle entre `Equipe & Postes`, `Planning` et `Acces & Securite`.

### 4. CRM & Relances

Role : gestion client et actions commerciales.

- `clients` - Clients
- `crm` - Champs CRM
- `follow-ups` - Relances
- `relance-config` - Configuration relances
- `targets` - Objectifs

Raison : `Clients` quitte `Analytics` pour rejoindre le domaine CRM. Les objectifs sont lies au pilotage commercial et aux relances.

### 5. Automatisation & Diffusion

Role : communications sortantes, templates et automatisations conversationnelles.

- `flowbot` - Automatisations
- `broadcasts` - Diffusions
- `templates` - Templates HSM
- `crons` - Taches planifiees

Raison : ces fonctions declenchent ou automatisent des actions. `CRONs` est plus coherent ici que dans `Dispatch & Queue`.

### 6. Analyse & Performance

Role : mesure, suivi et reporting.

- `analytics` - Analytics
- `performance` - Performance
- `ranking` - Classement
- `rapports` - Rapports

Raison : le groupe devient strictement analytique. Les clients n'y sont plus melanges.

### 7. Supervision & Alertes

Role : etat technique, alertes et go/no-go d'exploitation.

- `system-health` - Sante serveur
- `observabilite` - Observabilite
- `notifications` - Notifications
- `alert-config` - Alertes systeme
- `go_no_go` - GO/NO-GO

Raison : toutes les vues de surveillance sont regroupees. Les notifications restent visibles mais dans un contexte de supervision.

### 8. Administration & Securite

Role : droits, securite, audit, configuration de la plateforme.

- `roles` - Roles & permissions
- `ip-access` - Restrictions d'acces
- `login-logs` - Journal connexions
- `audit-logs` - Journal d'audit
- `sla-rules` - Regles SLA
- `ia-governance` - Gouvernance IA
- `settings` - Parametres

Raison : les controles d'acces, les traces, les SLA et la gouvernance sont des fonctions d'administration. `settings` devrait idealement devenir une entree de menu normale, pas seulement un bouton dans le profil.

### 9. Integrations & GICOP

Role : integrations externes et modules metier specifiques.

- `canaux` - Canaux
- `integration` - Integration ERP
- `outbound-webhooks` - Webhooks sortants
- `gicop-supervision` - Supervision GICOP
- `outbox-sync` - Sync DB2
- `complaints` - Plaintes clients

Raison : les canaux et webhooks sont des points d'integration. GICOP, DB2 et plaintes forment un sous-domaine metier specifique et gagnent a rester proches.

## Ordre final recommande

```ts
[
  'Tableau de bord',
  'Conversations & Dispatch',
  'Equipe & Planning',
  'CRM & Relances',
  'Automatisation & Diffusion',
  'Analyse & Performance',
  'Supervision & Alertes',
  'Administration & Securite',
  'Integrations & GICOP',
]
```

## Renommages recommandes

| Libelle actuel | Libelle propose | Raison |
| --- | --- | --- |
| Queue | File d'attente | Francais plus explicite |
| Broadcasts | Diffusions | Homogene avec le reste du menu |
| CRONs | Taches planifiees | Moins technique pour un admin |
| Observabilite | Observabilite | Garder, mais corriger l'encodage |
| Sante serveur | Sante serveur | Garder, mais corriger l'encodage |
| Integration ERP | Integration ERP | Garder, mais corriger l'encodage |
| Restriction geo. | Restrictions d'acces | Plus large que la geolocalisation |
| Capacite conv. | Capacite conversations | Plus lisible |
| Config relances auto | Configuration relances | Plus court et plus stable |
| Templates HSM | Templates WhatsApp | Plus comprehensible si les utilisateurs ne connaissent pas HSM |
| Webhooks sortants | Webhooks sortants | Garder, mais deplacer dans integrations |
| Heures travail | Heures de travail | Correction du libelle |

## Proposition de `navigationGroups`

Exemple de structure cible a transposer dans `admin/src/app/data/admin-data.ts` :

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
      { id: 'observabilite', name: 'Observabilite', icon: Activity, badge: null },
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

## Entrees pouvant etre combinees en onglets

Cette section propose de reduire le nombre d'entrees visibles dans la sidebar en fusionnant certaines vues proches dans une meme entree principale. Les `id` existants peuvent rester utilises en interne comme onglets, sous-vues ou etats de page.

### Combinaisons fortement recommandees

| Entree sidebar proposee | Onglets internes proposes | Entrees actuelles concernees | Pourquoi |
| --- | --- | --- | --- |
| `Conversations` | Conversations, Messages | `conversations`, `messages` | Les messages sont le detail naturel des conversations. Les separer dans la sidebar force un aller-retour inutile. |
| `Dispatch` | File d'attente, Regles dispatch, Capacite, Contextes | `queue`, `dispatch`, `capacity`, `contexts` | Ces vues pilotent le meme processus : recevoir, qualifier, router et limiter les conversations. |
| `Equipe` | Commerciaux, Groupes, Postes | `commerciaux`, `commercial-groups`, `postes` | Ces trois vues gerent la structure operationnelle des agents et leur rattachement aux postes. |
| `Planning` | Plannings, Presence du jour, Heures de travail | `work-schedule`, `presence`, `sessions` | Meme domaine temporel : horaires prevus, presence reelle et plages de travail. |
| `Clients & CRM` | Clients, Champs CRM | `clients`, `crm` | Les champs CRM configurent directement la fiche client. |
| `Relances` | Relances, Configuration relances | `follow-ups`, `relance-config` | La configuration est un onglet de parametrage du processus de relance. |
| `Performance` | Performance, Classement, Objectifs | `performance`, `ranking`, `targets` | Ces vues evaluent les commerciaux et leurs objectifs. |
| `Rapports & Analytics` | Analytics, Rapports | `analytics`, `rapports` | Les rapports sont une sortie ou une synthese des analytics. |
| `Diffusions` | Campagnes, Templates WhatsApp | `broadcasts`, `templates` | Les broadcasts utilisent les templates ; l'admin doit passer de l'un a l'autre sans changer de domaine. |
| `Automatisations` | FlowBot, Taches planifiees | `flowbot`, `crons` | Les CRONs sont des declencheurs ou routines d'automatisation. |
| `Supervision` | Sante serveur, Observabilite, Notifications, Alertes, GO/NO-GO | `system-health`, `observabilite`, `notifications`, `alert-config`, `go_no_go` | Ces vues servent toutes a surveiller l'etat de la plateforme et reagir aux incidents. |
| `Securite & Acces` | Roles, Restrictions d'acces, Connexions | `roles`, `ip-access`, `login-logs` | Meme logique de controle des utilisateurs, permissions et acces. |
| `Audit & Gouvernance` | Journal d'audit, Regles SLA, Gouvernance IA | `audit-logs`, `sla-rules`, `ia-governance` | Ces vues servent a encadrer les regles, la conformite et la tracabilite. |
| `Integrations` | Canaux, ERP, Webhooks | `canaux`, `integration`, `outbound-webhooks` | Ce sont les points d'entree/sortie avec des systemes externes. |
| `GICOP` | Supervision, Sync DB2, Plaintes clients | `gicop-supervision`, `outbox-sync`, `complaints` | Domaine metier specifique avec ses propres operations. |

### Structure sidebar compacte avec onglets

Avec ces regroupements, la sidebar peut descendre de 34 entrees a environ 16 entrees principales :

```ts
[
  'Vue d'ensemble',
  'Conversations',
  'Dispatch',
  'Equipe',
  'Planning',
  'Clients & CRM',
  'Relances',
  'Performance',
  'Rapports & Analytics',
  'Automatisations',
  'Diffusions',
  'Supervision',
  'Securite & Acces',
  'Audit & Gouvernance',
  'Integrations',
  'GICOP',
]
```

Cette option est plus lisible pour un panel qui continue a grandir. Elle demande par contre un ajustement de rendu : une entree de sidebar doit pouvoir ouvrir une page contenant des tabs internes.

### Priorite des fusions

1. `work-schedule` + `presence` + `sessions` dans `Planning`.
2. `queue` + `dispatch` + `capacity` + `contexts` dans `Dispatch`.
3. `system-health` + `observabilite` + `notifications` + `alert-config` + `go_no_go` dans `Supervision`.
4. `clients` + `crm` dans `Clients & CRM`.
5. `follow-ups` + `relance-config` dans `Relances`.
6. `broadcasts` + `templates` dans `Diffusions`.
7. `roles` + `ip-access` + `login-logs` dans `Securite & Acces`.

Ces fusions apportent le plus de clarte sans modifier le sens metier des vues.

### Combinaisons a eviter pour le moment

- Ne pas fusionner `Conversations` et `Dispatch` dans une seule entree : ce sont deux moments differents du travail, traitement humain d'un cote et orchestration de l'autre.
- Ne pas fusionner `CRM & Relances` avec `Performance` : l'un concerne l'action commerciale, l'autre la mesure.
- Ne pas melanger `GICOP` dans `Supervision` generale : le module semble porter un domaine metier specifique, avec DB2 et plaintes.
- Ne pas cacher `Vue d'ensemble` dans `Analytics` : elle doit rester l'entree de demarrage du panel.

## Ajustements UX recommandes

- Garder ouverts par defaut les groupes `Tableau de bord` et celui de la vue active uniquement.
- Ajouter une recherche rapide de menu si la sidebar reste au-dessus de 30 entrees.
- Eviter les badges permanents `NEW` une fois les modules stabilises, car ils augmentent le bruit visuel.
- Uniformiser les accents et corriger les problemes d'encodage visibles dans les libelles actuels.
- Faire remonter `Parametres` dans le groupe `Administration & Securite`, tout en conservant un raccourci profil si necessaire.
- Si certains modules sont reserves aux profils techniques, preparer ensuite un filtrage par role pour alleger le menu selon l'utilisateur.

## Variante plus compacte

Si l'objectif est une sidebar encore plus courte, fusionner :

- `Supervision & Alertes` avec `Administration & Securite` sous `Administration`.
- `Automatisation & Diffusion` avec `Integrations & GICOP` sous `Canaux & Automatisations`.

Cette variante descendrait a 7 groupes, mais elle rendrait les domaines moins lisibles pour les administrateurs non techniques.

## Priorite de mise en place

1. Corriger les libelles et l'encodage.
2. Reorganiser les groupes sans changer les `id`.
3. Ajouter `settings` dans `navigationGroups` si l'equipe valide son apparition dans la sidebar.
4. Tester la navigation de chaque entree dans le panel.
5. Envisager ensuite une recherche ou un filtrage par role si le nombre de modules continue d'augmenter.
